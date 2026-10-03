import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '@process-ai/db';
import { exportDepartmentPack, exportMapSvg, exportProcessPack } from './service.js';

const attachment = (filename: string) =>
  `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`;

export const packRoutes: FastifyPluginAsyncZod<{ db: Db }> = async (app, { db }) => {
  app.get(
    '/versions/:id/pack.pdf',
    { schema: { params: z.object({ id: z.uuid() }) } },
    async (request, reply) => {
      const user = app.requireUser(request);
      const pack = await exportProcessPack(db, user, request.params.id);
      if (!pack) throw app.httpErrors.notFound('Version not found');
      request.log.info({ versionId: request.params.id, userId: user.id }, 'Process pack exported');
      return reply
        .type('application/pdf')
        .header('content-disposition', attachment(pack.filename))
        .send(pack.body);
    },
  );

  app.get(
    '/versions/:id/map.svg',
    { schema: { params: z.object({ id: z.uuid() }) } },
    async (request, reply) => {
      const map = await exportMapSvg(db, app.requireUser(request), request.params.id);
      if (!map) throw app.httpErrors.notFound('Version not found');
      return reply
        .type('image/svg+xml')
        .header('content-disposition', attachment(map.filename))
        .send(map.body);
    },
  );

  app.get(
    '/departments/:slug/pack.zip',
    { schema: { params: z.object({ slug: z.string().regex(/^[a-z0-9-]+$/) }) } },
    async (request, reply) => {
      const user = app.requireUser(request);
      const pack = await exportDepartmentPack(db, user, request.params.slug);
      if (!pack) throw app.httpErrors.notFound('No processes you can access in this department');
      request.log.info(
        { department: request.params.slug, userId: user.id },
        'Department pack exported',
      );
      return reply
        .type('application/zip')
        .header('content-disposition', attachment(pack.filename))
        .send(pack.body);
    },
  );
};
