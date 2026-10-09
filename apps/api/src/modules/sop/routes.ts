import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '@process-ai/db';
import { SopDocument, SopPatch, SopState } from '@process-ai/shared';
import type { LlmGateway } from '@process-ai/agent';
import type { FileStore } from '@process-ai/knowledge';
import type { JobQueue } from '../../lib/jobs.js';
import { audit } from '../../lib/audit.js';
import { canViewVersion } from '../processes/visibility.js';
import { GovernanceError, loadVersionContext } from '../governance/service.js';
import { buildSop, generateSop, patchSop, publishSop, sopState } from './service.js';

const VersionParams = z.object({ id: z.uuid() });

/** SOPs generated from process versions: draft, review the wording, download, publish to the KB. */
export const sopRoutes: FastifyPluginAsyncZod<{
  db: Db;
  llm: LlmGateway | null;
  store: FileStore;
  jobs: JobQueue;
  orgCode: string;
}> = async (app, { db, llm, store, jobs, orgCode }) => {
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

  app.get(
    '/versions/:id/sop',
    { schema: { params: VersionParams, response: { 200: SopState } } },
    async (request) => {
      const { ctx } = await ctxFor(request, request.params.id);
      return sopState(db, ctx);
    },
  );

  app.post(
    '/versions/:id/sop',
    { schema: { params: VersionParams, response: { 201: SopDocument } } },
    async (request, reply) => {
      const { user, ctx } = await ctxFor(request, request.params.id);
      const sop = await generateSop(db, llm, user, ctx, orgCode, request.log);
      await audit(db, request, {
        action: 'sop.generated',
        entityType: 'process_version',
        entityId: ctx.version.id,
        after: { docId: sop.docId, aiDrafted: sop.aiDrafted },
      });
      return reply.status(201).send(sop);
    },
  );

  app.patch(
    '/versions/:id/sop',
    { schema: { params: VersionParams, body: SopPatch, response: { 200: SopDocument } } },
    async (request) => {
      const { ctx } = await ctxFor(request, request.params.id);
      const sop = await patchSop(db, ctx, request.body);
      await audit(db, request, {
        action: 'sop.edited',
        entityType: 'process_version',
        entityId: ctx.version.id,
        after: { fields: Object.keys(request.body) },
      });
      return sop;
    },
  );

  app.get(
    '/versions/:id/sop/download',
    { schema: { params: VersionParams } },
    async (request, reply) => {
      const { user, ctx } = await ctxFor(request, request.params.id);
      const { body, filename } = await buildSop(db, user, ctx);
      return reply
        .header(
          'content-type',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )
        .header('content-disposition', `attachment; filename="${filename}"`)
        .send(body);
    },
  );

  app.post(
    '/versions/:id/sop/publish',
    { schema: { params: VersionParams, response: { 200: SopDocument } } },
    async (request) => {
      const { user, ctx } = await ctxFor(request, request.params.id);
      const sop = await publishSop(db, user, ctx, store, jobs);
      await audit(db, request, {
        action: 'sop.published',
        entityType: 'process_version',
        entityId: ctx.version.id,
        after: { docId: sop.docId, knowledgeDocumentId: sop.knowledgeDocumentId },
      });
      return sop;
    },
  );
};
