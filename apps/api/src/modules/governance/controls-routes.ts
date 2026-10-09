import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '@process-ai/db';
import { Control, ControlInput } from '@process-ai/shared';
import { suggestControls, type LlmGateway } from '@process-ai/agent';
import { citationLabel, searchKnowledge } from '@process-ai/knowledge';
import { audit } from '../../lib/audit.js';
import { canViewVersion } from '../processes/visibility.js';
import { getVersionGraph } from '../processes/service.js';
import { assertEditable } from './editing.js';
import { GovernanceError, loadVersionContext } from './service.js';
import {
  addControls,
  confirmControl,
  controlNames,
  deleteControl,
  listControls,
  updateControl,
} from './controls.js';

const VersionParams = z.object({ id: z.uuid() });
const ControlParams = z.object({ id: z.uuid(), controlId: z.uuid() });

const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []);
/** Mostly the same words: treat as the same control. */
function similar(a: string, b: string) {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return false;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.min(wa.size, wb.size) >= 0.6;
}

/** Controls: the activities that enforce rules (preventive/detective, owner, evidence). */
export const controlRoutes: FastifyPluginAsyncZod<{ db: Db; llm: LlmGateway | null }> = async (
  app,
  { db, llm },
) => {
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

  const ctxFor = async (request: FastifyRequest, versionId: string) => {
    const user = app.requireUser(request);
    const ctx = await loadVersionContext(db, user, versionId);
    if (
      !canViewVersion(user, ctx.version, {
        ownerUserId: ctx.process.ownerUserId,
        processCreatedBy: ctx.process.createdBy,
      })
    )
      throw new GovernanceError(404, 'Version not found');
    return { user, ctx };
  };
  const editable = async (request: FastifyRequest, versionId: string) => {
    const r = await ctxFor(request, versionId);
    assertEditable(r.ctx);
    return r;
  };

  app.get(
    '/versions/:id/controls',
    { schema: { params: VersionParams, response: { 200: z.array(Control) } } },
    async (request) => {
      await ctxFor(request, request.params.id);
      return listControls(db, request.params.id);
    },
  );

  app.post(
    '/versions/:id/controls',
    { schema: { params: VersionParams, body: ControlInput, response: { 201: Control } } },
    async (request, reply) => {
      const { user, ctx } = await editable(request, request.params.id);
      const [created] = await addControls(db, ctx, user.id, [request.body]);
      await audit(db, request, {
        action: 'control.added',
        entityType: 'control',
        entityId: created!.id,
        after: request.body,
      });
      return reply.status(201).send(created!);
    },
  );

  app.patch(
    '/versions/:id/controls/:controlId',
    { schema: { params: ControlParams, body: ControlInput.partial() } },
    async (request, reply) => {
      const { user, ctx } = await editable(request, request.params.id);
      await updateControl(db, ctx, user.id, request.params.controlId, request.body);
      await audit(db, request, {
        action: 'control.updated',
        entityType: 'control',
        entityId: request.params.controlId,
        after: request.body,
      });
      return reply.status(204).send();
    },
  );

  app.post(
    '/versions/:id/controls/:controlId/confirm',
    { schema: { params: ControlParams } },
    async (request, reply) => {
      const { user, ctx } = await editable(request, request.params.id);
      await confirmControl(db, ctx, user.id, request.params.controlId);
      return reply.status(204).send();
    },
  );

  app.delete(
    '/versions/:id/controls/:controlId',
    { schema: { params: ControlParams } },
    async (request, reply) => {
      const { ctx } = await editable(request, request.params.id);
      await deleteControl(db, ctx, request.params.controlId);
      await audit(db, request, {
        action: 'control.deleted',
        entityType: 'control',
        entityId: request.params.controlId,
      });
      return reply.status(204).send();
    },
  );

  /** The AI drafts the controls the process already contains; they stay "AI inferred" until confirmed. */
  app.post(
    '/versions/:id/controls/suggest',
    { schema: { params: VersionParams, response: { 201: z.array(Control) } } },
    async (request, reply) => {
      if (!llm)
        throw app.httpErrors.serviceUnavailable('The AI is not configured. Set LLM_API_KEY.');
      const { user, ctx } = await editable(request, request.params.id);
      const graph = (await getVersionGraph(db, user, ctx.version.id))!;
      const existing = await controlNames(db, ctx.version.id);
      let references = '';
      try {
        const hits = await searchKnowledge(db, llm, {
          query: `${ctx.process.name} controls approvals verification segregation of duties`,
          departmentId: ctx.process.departmentId,
          limit: 4,
        });
        references = hits
          .map((h) => `[${citationLabel(h)}]\n${h.content.slice(0, 1200)}`)
          .join('\n\n');
      } catch (err) {
        request.log.warn({ err }, 'Knowledge search failed for control suggestions');
      }
      const suggested = (
        await suggestControls(llm, { processName: ctx.process.name, graph, existing, references })
      ).filter((c) => !existing.some((e) => similar(e, `${c.name} ${c.description ?? ''}`)));
      const created = suggested.length
        ? await addControls(db, ctx, user.id, suggested, 'inferred')
        : [];
      await audit(db, request, {
        action: 'control.suggested',
        entityType: 'process_version',
        entityId: ctx.version.id,
        after: { count: created.length },
      });
      return reply.status(201).send(created);
    },
  );
};
