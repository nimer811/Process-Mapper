import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, disagreements, eq, interviewSessions, ne, users, type Db } from '@process-ai/db';
import {
  AskAboutDisagreementInput,
  Contributor,
  Disagreement,
  executionModes,
  InterviewMessage,
  InviteContributorInput,
  ResolveDisagreementInput,
  type ExecutionMode,
} from '@process-ai/shared';
import { DISAGREEMENT_FIELD_LABEL, InterviewEngine, type LlmGateway } from '@process-ai/agent';
import { audit } from '../../lib/audit.js';
import { canViewVersion } from '../processes/visibility.js';
import { canEditVersion } from '../governance/lifecycle.js';
import { GovernanceError, loadVersionContext } from '../governance/service.js';
import * as edit from '../governance/editing.js';
import { openTask, syncVersionTasks } from '../tasks/service.js';
import { listContributors, listDisagreements, sessionOf } from './service.js';

const VersionParams = z.object({ id: z.uuid() });
const DisagreementParams = z.object({ id: z.uuid(), disagreementId: z.uuid() });

/**
 * Several people, one process: invite colleagues to add their view, and settle where they described
 * things differently (the AI recommends, the process owner decides).
 */
export const contributionRoutes: FastifyPluginAsyncZod<{ db: Db; llm: LlmGateway | null }> = async (
  app,
  { db, llm },
) => {
  const engine = llm ? new InterviewEngine(db, llm, app.log) : null;
  const requireEngine = () => {
    if (!engine)
      throw app.httpErrors.serviceUnavailable(
        'The AI interviewer is not configured. Set LLM_API_KEY.',
      );
    return engine;
  };

  const ctxFor = async (request: FastifyRequest, versionId: string) => {
    const user = app.requireUser(request);
    let ctx;
    try {
      ctx = await loadVersionContext(db, user, versionId);
    } catch (e) {
      if (e instanceof GovernanceError) throw app.httpErrors.notFound(e.message);
      throw e;
    }
    if (
      !canViewVersion(user, ctx.version, {
        ownerUserId: ctx.process.ownerUserId,
        processCreatedBy: ctx.process.createdBy,
      })
    )
      throw app.httpErrors.notFound('Version not found');
    return { user, ctx };
  };
  /** Owner or admin, on a version that can still change. */
  const manage = async (request: FastifyRequest, versionId: string) => {
    const r = await ctxFor(request, versionId);
    if (!r.ctx.actor.isAdmin && !r.ctx.actor.isOwner)
      throw app.httpErrors.forbidden('Only the process owner or an admin can do this');
    if (r.ctx.process.archivedAt || !canEditVersion(r.ctx.version.status, r.ctx.actor))
      throw app.httpErrors.conflict('Only a draft or a version under validation can change');
    return r;
  };
  const disagreementOf = async (versionId: string, id: string) => {
    const d = await db.query.disagreements.findFirst({
      where: and(eq(disagreements.id, id), eq(disagreements.versionId, versionId)),
    });
    if (!d) throw app.httpErrors.notFound('Disagreement not found');
    return d;
  };

  app.get(
    '/versions/:id/contributors',
    { schema: { params: VersionParams, response: { 200: z.array(Contributor) } } },
    async (request) => {
      await ctxFor(request, request.params.id);
      return listContributors(db, request.params.id);
    },
  );

  app.post(
    '/versions/:id/contributors',
    {
      schema: {
        params: VersionParams,
        body: InviteContributorInput,
        response: { 201: Contributor },
      },
    },
    async (request, reply) => {
      const { user, ctx } = await manage(request, request.params.id);
      const e = requireEngine();
      const invitee = await db.query.users.findFirst({ where: eq(users.id, request.body.userId) });
      if (!invitee?.isActive) throw app.httpErrors.badRequest('Choose an active user');
      const unfinished = await db.query.interviewSessions.findFirst({
        where: and(
          eq(interviewSessions.versionId, ctx.version.id),
          eq(interviewSessions.userId, invitee.id),
          ne(interviewSessions.status, 'completed'),
        ),
      });
      if (unfinished)
        throw app.httpErrors.conflict(
          `${invitee.displayName} already has an interview open on this process`,
        );

      const started = await e.startContribution({
        versionId: ctx.version.id,
        userId: invitee.id,
        userDisplayName: invitee.displayName,
        invitedById: user.id,
        invitedByName: user.displayName,
        focus: request.body.focus,
      });
      const focus = request.body.focus?.trim();
      await openTask(db, {
        userId: invitee.id,
        kind: 'add_view',
        title: `Add your view on "${ctx.process.name}"`,
        detail: `${user.displayName} asked for your view${focus ? ` on ${focus}` : ''}. It's a short interview about the parts you're involved in.`,
        link: `/interviews/${started.sessionId}`,
        processId: ctx.process.id,
        versionId: ctx.version.id,
        sessionId: started.sessionId,
      });
      await audit(db, request, {
        action: 'contributor.invited',
        entityType: 'process_version',
        entityId: ctx.version.id,
        after: { userId: invitee.id, focus: focus ?? null },
      });
      const contributor = (await listContributors(db, ctx.version.id)).find(
        (c) => c.sessionId === started.sessionId,
      )!;
      return reply.status(201).send(contributor);
    },
  );

  app.get(
    '/versions/:id/disagreements',
    { schema: { params: VersionParams, response: { 200: z.array(Disagreement) } } },
    async (request) => {
      await ctxFor(request, request.params.id);
      return listDisagreements(db, request.params.id);
    },
  );

  /** keep: the current description stands (confirmed); accept: apply the other person's description. */
  app.post(
    '/versions/:id/disagreements/:disagreementId/resolve',
    { schema: { params: DisagreementParams, body: ResolveDisagreementInput } },
    async (request, reply) => {
      const { user, ctx } = await manage(request, request.params.id);
      const d = await disagreementOf(ctx.version.id, request.params.disagreementId);
      if (d.status !== 'open') throw app.httpErrors.conflict('Already settled');
      const { decision, note } = request.body;

      if (decision === 'keep') {
        await edit.acceptElement(db, ctx, user.id, d.entityType, d.entityId);
      } else if (d.field === 'remove') {
        if (d.entityType === 'step') await edit.deleteStep(db, ctx, d.entityId);
        else if (d.entityType === 'edge') await edit.deleteEdge(db, ctx, d.entityId);
      } else if (d.field === 'statement') {
        await edit.updateRuleStatement(db, ctx, user.id, d.entityId, d.proposedValue);
      } else if (d.field === 'execution') {
        if (!executionModes.includes(d.proposedValue as ExecutionMode))
          throw app.httpErrors.badRequest('Not a valid execution mode');
        await edit.updateStep(db, ctx, user.id, d.entityId, {
          execution: d.proposedValue as ExecutionMode,
        });
      } else {
        const key = {
          actor: 'actor',
          sla: 'sla',
          expected_duration: 'expectedDuration',
          approval_authority: 'approvalAuthority',
        }[d.field];
        await edit.updateStep(db, ctx, user.id, d.entityId, { [key]: d.proposedValue });
      }
      const label =
        decision === 'keep' ? `Kept: ${d.currentValue}` : `Accepted: ${d.proposedValue}`;
      await db
        .update(disagreements)
        .set({
          status: 'resolved',
          resolution: note ? `${label} — ${note}` : label,
          resolvedBy: user.id,
          resolvedAt: new Date(),
        })
        .where(eq(disagreements.id, d.id));
      // Removing an element settles any other open disagreement about it.
      if (decision === 'accept' && d.field === 'remove') {
        await db
          .update(disagreements)
          .set({
            status: 'resolved',
            resolution: 'Element removed',
            resolvedBy: user.id,
            resolvedAt: new Date(),
          })
          .where(and(eq(disagreements.entityId, d.entityId), eq(disagreements.status, 'open')));
      }
      await syncVersionTasks(db, ctx.version.id);
      await audit(db, request, {
        action: 'disagreement.resolved',
        entityType: 'disagreement',
        entityId: d.id,
        after: request.body,
      });
      return reply.status(204).send();
    },
  );

  /** Ask one of the two people to clarify, in their interview. The disagreement stays open. */
  app.post(
    '/versions/:id/disagreements/:disagreementId/ask',
    {
      schema: {
        params: DisagreementParams,
        body: AskAboutDisagreementInput,
        response: { 200: InterviewMessage },
      },
    },
    async (request) => {
      const { ctx } = await manage(request, request.params.id);
      const e = requireEngine();
      const d = await disagreementOf(ctx.version.id, request.params.disagreementId);
      const askUser = request.body.side === 'current' ? d.currentUserId : d.proposedUserId;
      const session = askUser ? await sessionOf(db, ctx.version.id, askUser) : null;
      if (!session)
        throw app.httpErrors.conflict('That person has no interview on this process to continue');
      const [mine, theirs] =
        request.body.side === 'current'
          ? [d.currentValue, d.proposedValue]
          : [d.proposedValue, d.currentValue];
      const question = `About ${d.subject} (${DISAGREEMENT_FIELD_LABEL[d.field]}): you described it as "${mine}", and a colleague as "${theirs}". Which reflects how it works today — or does it depend on the case?`;
      const message = await e.ask(session.id, question);
      await openTask(db, {
        userId: session.userId,
        kind: 'confirm_points',
        title: `Answer a question on "${ctx.process.name}"`,
        detail:
          'The process owner needs your help to settle a point colleagues described differently.',
        link: `/interviews/${session.id}`,
        processId: ctx.process.id,
        versionId: ctx.version.id,
        sessionId: session.id,
      });
      const name = (await db.query.users.findFirst({ where: eq(users.id, session.userId) }))
        ?.displayName;
      await db
        .update(disagreements)
        .set({ resolution: `Asked ${name ?? 'them'} on ${new Date().toISOString().slice(0, 10)}` })
        .where(eq(disagreements.id, d.id));
      return message;
    },
  );

  /** Re-runs the AI recommendation (e.g. if it failed or new documents were added). */
  app.post(
    '/versions/:id/disagreements/:disagreementId/recommend',
    { schema: { params: DisagreementParams } },
    async (request) => {
      const { ctx } = await manage(request, request.params.id);
      const d = await disagreementOf(ctx.version.id, request.params.disagreementId);
      const recommendation = await requireEngine().recommend(d.id);
      if (!recommendation) throw app.httpErrors.conflict('Already settled');
      return recommendation;
    },
  );
};
