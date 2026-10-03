import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '@process-ai/db';
import {
  InterviewDetail,
  InterviewMessage,
  InterviewSummary,
  PostMessageInput,
  StartInterviewInput,
  type InterviewStreamEvent,
} from '@process-ai/shared';
import {
  InterviewEngine,
  SessionBusyError,
  SessionClosedError,
  SessionNotFoundError,
  type LlmGateway,
} from '@process-ai/agent';
import { getAccessibleSession, getInterviewDetail, listInterviews } from './service.js';

const IdParams = z.object({ id: z.uuid() });

export const interviewRoutes: FastifyPluginAsyncZod<{ db: Db; llm: LlmGateway | null }> = async (
  app,
  { db, llm },
) => {
  const engine = llm ? new InterviewEngine(db, llm, app.log) : null;

  const load = async (
    request: Parameters<typeof app.requireUser>[0],
    id: string,
    mustOwn: boolean,
  ) => {
    const user = app.requireUser(request);
    const found = await getAccessibleSession(db, user, id);
    if (!found) throw app.httpErrors.notFound('Interview not found');
    if (mustOwn && !found.isOwner)
      throw app.httpErrors.forbidden('Only the person interviewed can continue this interview');
    return { user, ...found };
  };

  const requireEngine = () => {
    if (!engine)
      throw app.httpErrors.serviceUnavailable(
        'The AI interviewer is not configured. Set LLM_API_KEY.',
      );
    return engine;
  };

  const mapEngineError = (e: unknown) => {
    if (e instanceof SessionBusyError) return app.httpErrors.conflict(e.message);
    if (e instanceof SessionClosedError) return app.httpErrors.conflict(e.message);
    if (e instanceof SessionNotFoundError) return app.httpErrors.notFound(e.message);
    return e;
  };

  app.get(
    '/interviews',
    {
      schema: {
        querystring: z.object({ all: z.stringbool().optional() }),
        response: { 200: z.array(InterviewSummary) },
      },
    },
    async (request) => listInterviews(db, app.requireUser(request), request.query.all ?? false),
  );

  app.post(
    '/interviews',
    {
      schema: {
        body: StartInterviewInput,
        response: { 201: z.object({ interview: InterviewDetail }) },
      },
    },
    async (request, reply) => {
      const user = app.requireUser(request);
      const e = requireEngine();
      const started = await e.startSession({
        userId: user.id,
        userDisplayName: user.displayName,
        departmentId: request.body.departmentId,
        processName: request.body.processName,
      });
      const { summary } = (await getAccessibleSession(db, user, started.sessionId))!;
      return reply.status(201).send({ interview: await getInterviewDetail(db, summary, true) });
    },
  );

  app.get(
    '/interviews/:id',
    { schema: { params: IdParams, response: { 200: InterviewDetail } } },
    async (request) => {
      const { summary } = await load(request, request.params.id, false);
      return getInterviewDetail(db, summary, !!engine);
    },
  );

  /** Streams the interviewer's reply as server-sent events: state → token* → message. */
  app.post(
    '/interviews/:id/messages',
    { schema: { params: IdParams, body: PostMessageInput } },
    async (request, reply) => {
      const { user } = await load(request, request.params.id, true);
      const e = requireEngine();
      const events = e.postMessage({
        sessionId: request.params.id,
        userId: user.id,
        text: request.body.text,
      });

      // Pull the first event before committing to a stream, so busy/closed errors stay normal HTTP errors.
      let first: IteratorResult<InterviewStreamEvent>;
      try {
        first = (await events.next()) as IteratorResult<InterviewStreamEvent>;
      } catch (err) {
        throw mapEngineError(err);
      }

      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      let open = true;
      request.raw.on('close', () => {
        open = false; // keep processing so the turn is saved; just stop writing
      });
      const send = (event: InterviewStreamEvent) => {
        if (open) res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      try {
        if (!first.done) send(first.value);
        for await (const event of events as AsyncIterable<InterviewStreamEvent>) send(event);
      } catch (err) {
        request.log.error({ err }, 'Interview turn failed');
        send({
          type: 'error',
          message: 'Something went wrong while processing your message. Please try again.',
        });
      } finally {
        res.end();
      }
    },
  );

  app.post(
    '/interviews/:id/resume',
    { schema: { params: IdParams, response: { 200: InterviewMessage } } },
    async (request) => {
      await load(request, request.params.id, true);
      try {
        return await requireEngine().resume(request.params.id);
      } catch (err) {
        throw mapEngineError(err);
      }
    },
  );

  app.post('/interviews/:id/pause', { schema: { params: IdParams } }, async (request, reply) => {
    await load(request, request.params.id, true);
    await requireEngine().pause(request.params.id);
    return reply.status(204).send();
  });

  app.post(
    '/interviews/:id/complete',
    { schema: { params: IdParams, response: { 200: InterviewMessage } } },
    async (request) => {
      const { summary } = await load(request, request.params.id, true);
      if (summary.stage !== 'summary')
        throw app.httpErrors.conflict('Review the summary before completing the interview');
      return requireEngine().complete(request.params.id);
    },
  );
};
