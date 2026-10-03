import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { asc, eq, processes, users, type Db } from '@process-ai/db';
import {
  AcceptInput,
  EdgeInput,
  EvidenceItem,
  HistoryEvent,
  NewVersionInput,
  ProcessPatch,
  Readiness,
  ResolveItemInput,
  RuleInput,
  StepInput,
  TransitionInput,
  UserRef,
  VersionDiff,
  VersionMetaPatch,
} from '@process-ai/shared';
import { audit } from '../../lib/audit.js';
import { canViewVersion } from '../processes/visibility.js';
import { getVersionGraph } from '../processes/service.js';
import { runRuleChecks } from '../analysis/service.js';
import * as edit from './editing.js';
import {
  archiveProcess,
  createVersion,
  diffVersions,
  evidenceFor,
  GovernanceError,
  history,
  loadVersionContext,
  readiness,
  transition,
} from './service.js';

const VersionParams = z.object({ id: z.uuid() });
const StepParams = z.object({ id: z.uuid(), stepId: z.uuid() });
const EdgeParams = z.object({ id: z.uuid(), edgeId: z.uuid() });
const RuleParams = z.object({ id: z.uuid(), ruleId: z.uuid() });
const ItemParams = z.object({ id: z.uuid(), itemId: z.uuid() });

export const governanceRoutes: FastifyPluginAsyncZod<{ db: Db }> = async (app, { db }) => {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof GovernanceError) {
      return reply.status(error.status).type('application/problem+json').send({
        type: 'about:blank',
        title: error.message,
        status: error.status,
        instance: request.url,
      });
    }
    throw error;
  });

  /** Version context for a caller who can see it (404 otherwise, so drafts don't leak). */
  const ctxFor = async (request: FastifyRequest, versionId: string) => {
    const user = app.requireUser(request);
    const ctx = await loadVersionContext(db, user, versionId);
    if (
      !canViewVersion(user, ctx.version, {
        ownerUserId: ctx.process.ownerUserId,
        processCreatedBy: ctx.process.createdBy,
      })
    ) {
      throw new GovernanceError(404, 'Version not found');
    }
    return { user, ctx };
  };
  const editable = async (request: FastifyRequest, versionId: string) => {
    const r = await ctxFor(request, versionId);
    edit.assertEditable(r.ctx);
    return r;
  };

  // ---- Lifecycle ----

  app.get(
    '/versions/:id/readiness',
    { schema: { params: VersionParams, response: { 200: Readiness } } },
    async (request) => {
      const { ctx } = await ctxFor(request, request.params.id);
      return readiness(db, ctx);
    },
  );

  app.post(
    '/versions/:id/transitions',
    { schema: { params: VersionParams, body: TransitionInput, response: { 200: Readiness } } },
    async (request) => {
      const { user, ctx } = await ctxFor(request, request.params.id);
      await transition(db, ctx, user.id, request.body.action, request.body.comment);
      if (request.body.action === 'validate') {
        // Validated content gets an automatic rule check (cheap, deterministic, no AI).
        const graph = await getVersionGraph(db, user, ctx.version.id);
        if (graph)
          await runRuleChecks(db, graph).catch((err) =>
            request.log.warn({ err }, 'Rule checks failed'),
          );
      }
      await audit(db, request, {
        action: `version.${request.body.action}`,
        entityType: 'process_version',
        entityId: ctx.version.id,
        after: request.body,
      });
      return readiness(db, await loadVersionContext(db, user, ctx.version.id));
    },
  );

  app.get(
    '/versions/:id/history',
    { schema: { params: VersionParams, response: { 200: z.array(HistoryEvent) } } },
    async (request) => {
      await ctxFor(request, request.params.id);
      return history(db, request.params.id);
    },
  );

  app.post(
    '/versions/:id/new-version',
    {
      schema: {
        params: VersionParams,
        body: NewVersionInput,
        response: { 201: z.object({ id: z.uuid(), versionNumber: z.number() }) },
      },
    },
    async (request, reply) => {
      const { user, ctx } = await ctxFor(request, request.params.id);
      const v = await createVersion(db, ctx, user.id, request.body.changeSummary);
      await audit(db, request, {
        action: 'version.created',
        entityType: 'process_version',
        entityId: v.id,
        after: { basedOn: ctx.version.id },
      });
      return reply.status(201).send({ id: v.id, versionNumber: v.versionNumber });
    },
  );

  // ---- Provenance & comparison ----

  app.get(
    '/versions/:id/evidence',
    {
      schema: {
        params: VersionParams,
        querystring: z.object({ entityId: z.uuid().optional() }),
        response: { 200: z.array(EvidenceItem) },
      },
    },
    async (request) => {
      await ctxFor(request, request.params.id);
      return evidenceFor(db, request.params.id, request.query.entityId);
    },
  );

  app.get(
    '/versions/:id/compare',
    {
      schema: {
        params: VersionParams,
        querystring: z.object({ with: z.uuid() }),
        response: { 200: VersionDiff },
      },
    },
    async (request) => {
      const user = app.requireUser(request);
      const [to, from] = await Promise.all([
        getVersionGraph(db, user, request.params.id),
        getVersionGraph(db, user, request.query.with),
      ]);
      if (!to || !from || to.processId !== from.processId)
        throw new GovernanceError(404, 'Versions not found');
      return diffVersions(from, to);
    },
  );

  // ---- Editing (owner / admin; creator while draft) ----

  app.patch(
    '/versions/:id',
    { schema: { params: VersionParams, body: VersionMetaPatch } },
    async (request, reply) => {
      const { user, ctx } = await editable(request, request.params.id);
      await edit.updateMetadata(db, ctx, user.id, request.body);
      await audit(db, request, {
        action: 'version.metadata_updated',
        entityType: 'process_version',
        entityId: ctx.version.id,
        after: request.body,
      });
      return reply.status(204).send();
    },
  );

  app.post(
    '/versions/:id/steps',
    { schema: { params: VersionParams, body: StepInput } },
    async (request, reply) => {
      const { user, ctx } = await editable(request, request.params.id);
      const step = await edit.addStep(db, ctx, user.id, request.body);
      await audit(db, request, {
        action: 'step.added',
        entityType: 'step',
        entityId: step.id,
        after: request.body,
      });
      return reply.status(201).send({ id: step.id, stepKey: step.stepKey });
    },
  );

  app.patch(
    '/versions/:id/steps/:stepId',
    { schema: { params: StepParams, body: StepInput.partial() } },
    async (request, reply) => {
      const { user, ctx } = await editable(request, request.params.id);
      const stepId = request.params.stepId;
      await edit.updateStep(db, ctx, user.id, stepId, request.body);
      await audit(db, request, {
        action: 'step.updated',
        entityType: 'step',
        entityId: stepId,
        after: request.body,
      });
      return reply.status(204).send();
    },
  );

  app.delete(
    '/versions/:id/steps/:stepId',
    { schema: { params: StepParams } },
    async (request, reply) => {
      const { ctx } = await editable(request, request.params.id);
      const stepId = request.params.stepId;
      await edit.deleteStep(db, ctx, stepId);
      await audit(db, request, { action: 'step.deleted', entityType: 'step', entityId: stepId });
      return reply.status(204).send();
    },
  );

  app.post(
    '/versions/:id/edges',
    { schema: { params: VersionParams, body: EdgeInput } },
    async (request, reply) => {
      const { user, ctx } = await editable(request, request.params.id);
      const e = await edit.addEdge(db, ctx, user.id, request.body);
      await audit(db, request, {
        action: 'edge.added',
        entityType: 'edge',
        entityId: e.id,
        after: request.body,
      });
      return reply.status(201).send({ id: e.id });
    },
  );

  app.delete(
    '/versions/:id/edges/:edgeId',
    { schema: { params: EdgeParams } },
    async (request, reply) => {
      const { ctx } = await editable(request, request.params.id);
      await edit.deleteEdge(db, ctx, request.params.edgeId);
      await audit(db, request, {
        action: 'edge.deleted',
        entityType: 'edge',
        entityId: request.params.edgeId,
      });
      return reply.status(204).send();
    },
  );

  app.post(
    '/versions/:id/rules',
    { schema: { params: VersionParams, body: RuleInput } },
    async (request, reply) => {
      const { user, ctx } = await editable(request, request.params.id);
      const rule = await edit.addRule(db, ctx, user.id, request.body);
      await audit(db, request, {
        action: 'rule.added',
        entityType: 'rule',
        entityId: rule.id,
        after: request.body,
      });
      return reply.status(201).send({ id: rule.id });
    },
  );

  app.delete(
    '/versions/:id/rules/:ruleId',
    { schema: { params: RuleParams } },
    async (request, reply) => {
      const { ctx } = await editable(request, request.params.id);
      await edit.deleteRule(db, ctx, request.params.ruleId);
      await audit(db, request, {
        action: 'rule.deleted',
        entityType: 'rule',
        entityId: request.params.ruleId,
      });
      return reply.status(204).send();
    },
  );

  app.post(
    '/versions/:id/accept',
    { schema: { params: VersionParams, body: AcceptInput } },
    async (request, reply) => {
      const { user, ctx } = await editable(request, request.params.id);
      await edit.acceptElement(db, ctx, user.id, request.body.entityType, request.body.entityId);
      await audit(db, request, {
        action: `${request.body.entityType}.accepted`,
        entityType: request.body.entityType,
        entityId: request.body.entityId,
      });
      return reply.status(204).send();
    },
  );

  app.post(
    '/versions/:id/open-items/:itemId/resolve',
    { schema: { params: ItemParams, body: ResolveItemInput } },
    async (request, reply) => {
      const { ctx } = await editable(request, request.params.id);
      await edit.resolveOpenItem(db, ctx, request.params.itemId, request.body.resolution);
      await audit(db, request, {
        action: 'open_item.resolved',
        entityType: 'open_item',
        entityId: request.params.itemId,
        after: request.body,
      });
      return reply.status(204).send();
    },
  );

  // ---- Process administration ----

  app.patch(
    '/processes/:id',
    { schema: { params: VersionParams, body: ProcessPatch } },
    async (request, reply) => {
      app.requireRole(request, 'admin');
      const before = await db.query.processes.findFirst({
        where: eq(processes.id, request.params.id),
      });
      if (!before) throw new GovernanceError(404, 'Process not found');
      if (request.body.ownerUserId) {
        const owner = await db.query.users.findFirst({
          where: eq(users.id, request.body.ownerUserId),
        });
        if (!owner?.isActive) throw new GovernanceError(400, 'Owner must be an active user');
      }
      const [after] = await db
        .update(processes)
        .set(request.body)
        .where(eq(processes.id, before.id))
        .returning();
      await audit(db, request, {
        action: 'process.updated',
        entityType: 'process',
        entityId: before.id,
        before,
        after,
      });
      return reply.status(204).send();
    },
  );

  app.post(
    '/processes/:id/archive',
    {
      schema: {
        params: VersionParams,
        body: z.object({ comment: z.string().trim().max(1000).optional() }).optional(),
      },
    },
    async (request, reply) => {
      const user = app.requireRole(request, 'admin');
      const proc = await db.query.processes.findFirst({
        where: eq(processes.id, request.params.id),
      });
      if (!proc) throw new GovernanceError(404, 'Process not found');
      if (proc.archivedAt) throw new GovernanceError(409, 'Already archived');
      await archiveProcess(db, proc.id, user.id, request.body?.comment);
      await audit(db, request, {
        action: 'process.archived',
        entityType: 'process',
        entityId: proc.id,
      });
      return reply.status(204).send();
    },
  );

  /** Active users, for choosing process owners (admin). */
  app.get('/users', { schema: { response: { 200: z.array(UserRef) } } }, async (request) => {
    app.requireRole(request, 'admin');
    return db
      .select({ id: users.id, displayName: users.displayName, email: users.email })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(asc(users.displayName));
  });
};
