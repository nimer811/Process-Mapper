import type { FastifyRequest } from 'fastify';
import { auditLog, type Db } from '@process-ai/db';

/** Append an audit entry for a write. Pass a transaction as `db` to keep it atomic with the change. */
export async function audit(
  db: Db,
  request: FastifyRequest,
  entry: { action: string; entityType: string; entityId: string; before?: unknown; after?: unknown },
) {
  await db.insert(auditLog).values({
    actorUserId: request.user?.id ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    requestId: request.id,
  });
}
