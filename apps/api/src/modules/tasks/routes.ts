import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, eq, tasks, type Db } from '@process-ai/db';
import { Task } from '@process-ai/shared';
import { listTasks } from './service.js';

export const taskRoutes: FastifyPluginAsyncZod<{ db: Db }> = async (app, { db }) => {
  app.get('/tasks', { schema: { response: { 200: z.array(Task) } } }, async (request) =>
    listTasks(db, app.requireUser(request).id),
  );

  /** Nudges can be dismissed; review tasks close themselves when the action is done. */
  app.post(
    '/tasks/:id/dismiss',
    { schema: { params: z.object({ id: z.uuid() }) } },
    async (request, reply) => {
      const user = app.requireUser(request);
      const [t] = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, request.params.id), eq(tasks.userId, user.id)));
      if (!t) throw app.httpErrors.notFound('Task not found');
      if (t.kind !== 'continue_interview')
        throw app.httpErrors.conflict('This task closes itself when the action is done');
      await db
        .update(tasks)
        .set({ status: 'dismissed', completedAt: new Date() })
        .where(eq(tasks.id, t.id));
      return reply.status(204).send();
    },
  );
};
