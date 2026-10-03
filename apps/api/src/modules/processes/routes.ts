import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '@process-ai/db';
import { ProcessDetail, ProcessListItem, ProcessListQuery, VersionGraph } from '@process-ai/shared';
import { getProcess, getVersionGraph, listProcesses } from './service.js';

const IdParams = z.object({ id: z.uuid() });

export const processRoutes: FastifyPluginAsyncZod<{ db: Db }> = async (app, { db }) => {
  app.get(
    '/processes',
    { schema: { querystring: ProcessListQuery, response: { 200: z.array(ProcessListItem) } } },
    async (request) => listProcesses(db, app.requireUser(request), request.query),
  );

  app.get(
    '/processes/:id',
    { schema: { params: IdParams, response: { 200: ProcessDetail } } },
    async (request) => {
      const detail = await getProcess(db, app.requireUser(request), request.params.id);
      if (!detail) throw app.httpErrors.notFound('Process not found');
      return detail;
    },
  );

  app.get(
    '/versions/:id',
    { schema: { params: IdParams, response: { 200: VersionGraph } } },
    async (request) => {
      const graph = await getVersionGraph(db, app.requireUser(request), request.params.id);
      if (!graph) throw app.httpErrors.notFound('Version not found');
      return graph;
    },
  );
};
