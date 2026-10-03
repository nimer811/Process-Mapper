import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import type { ProblemDetails } from '@process-ai/shared';

/** Every error leaves the API as RFC 9457 problem details. */
export function registerErrorHandling(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const body: ProblemDetails = {
        type: 'about:blank',
        title: 'Invalid request',
        status: 400,
        instance: request.url,
        errors: error.validation.map((v) => ({
          path: v.instancePath.replace(/^\//, '').replaceAll('/', '.'),
          message: v.message ?? 'Invalid value',
        })),
      };
      return reply.status(400).type('application/problem+json').send(body);
    }

    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    if (status >= 500 && status !== 503) request.log.error({ err: error }, 'Unhandled error');

    // Unexpected failures stay opaque; deliberate "service unavailable" errors keep their message.
    const opaque = status >= 500 && status !== 503;
    const body: ProblemDetails = {
      type: 'about:blank',
      title: opaque ? 'Internal Server Error' : error.message,
      status,
      instance: request.url,
    };
    return reply.status(status).type('application/problem+json').send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const body: ProblemDetails = {
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      instance: request.url,
    };
    return reply.status(404).type('application/problem+json').send(body);
  });
}
