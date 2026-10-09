import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

export const ACCESS_CODE_HEADER = 'x-access-code';

/** Open without the code: what the sign-in page needs before the code is entered. */
const OPEN = new Set(['/api/v1/auth/config', '/api/v1/auth/access']);

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Demo protection: when DEMO_ACCESS_CODE is set, every API call needs that code (entered once on
 * the sign-in page). Health checks and the web app's files stay open.
 */
export function registerAccessCode(app: FastifyInstance, code: string | undefined) {
  if (!code) return;
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (!path.startsWith('/api/') || OPEN.has(path)) return;
    const given = request.headers[ACCESS_CODE_HEADER];
    if (typeof given === 'string' && same(given, code)) return;
    return reply.status(401).type('application/problem+json').send({
      type: 'about:blank',
      title: 'Access code required',
      status: 401,
      instance: request.url,
    });
  });

  app.post('/api/v1/auth/access', async (request, reply) => {
    const body = z.object({ code: z.string().max(200) }).safeParse(request.body);
    if (body.success && same(body.data.code.trim(), code)) return reply.status(204).send();
    // Slow down guessing.
    await new Promise((r) => setTimeout(r, 800));
    return reply.status(401).type('application/problem+json').send({
      type: 'about:blank',
      title: 'That access code is not right',
      status: 401,
      instance: request.url,
    });
  });
}
