import { and, eq, inArray } from 'drizzle-orm';
import { openItems, type Db } from '@process-ai/db';
import type { Gap } from './gaps.js';
import { MAX_TIMES_ASKED } from './policy.js';
import type { InterviewState } from './state.js';

/**
 * Keeps open_items in step with the latest gap analysis:
 * - new gaps become open items;
 * - gaps that disappeared (answered) are resolved;
 * - probes are resolved one turn after being asked (any answer counts);
 * - items asked too often are dismissed as unknown so the interviewer stops nagging.
 */
export async function syncOpenItems(db: Db, state: InterviewState, gaps: Gap[], turn: number) {
  const sessionId = state.session.id;
  const byKey = new Map(state.openItems.filter((i) => i.gapKey).map((i) => [i.gapKey!, i]));
  const gapKeys = new Set(gaps.map((g) => g.gapKey));

  const fresh = gaps.filter((g) => !byKey.has(g.gapKey));
  if (fresh.length) {
    await db
      .insert(openItems)
      .values(
        fresh.map((g) => ({
          sessionId,
          versionId: state.session.versionId,
          type: g.source === 'probe' ? ('question' as const) : ('missing_info' as const),
          gapKey: g.gapKey,
          source: g.source,
          entityType: g.entityType,
          entityId: g.entityId,
          field: g.field,
          description: g.description,
          priority: g.priority,
        })),
      )
      .onConflictDoNothing();
  }

  const active = state.openItems.filter((i) => i.status === 'open' || i.status === 'asked');
  const answered = active.filter((i) => i.source === 'gap_analysis' && i.gapKey && !gapKeys.has(i.gapKey)).map((i) => i.id);
  const probesDone = active
    .filter((i) => i.source === 'probe' && i.status === 'asked' && (i.lastAskedTurn ?? turn) < turn)
    .map((i) => i.id);
  const exhausted = active
    .filter((i) => i.timesAsked >= MAX_TIMES_ASKED && !answered.includes(i.id) && !probesDone.includes(i.id))
    .map((i) => i.id);

  if (answered.length || probesDone.length) {
    await db
      .update(openItems)
      .set({ status: 'resolved', resolution: 'answered' })
      .where(and(eq(openItems.sessionId, sessionId), inArray(openItems.id, [...answered, ...probesDone])));
  }
  if (exhausted.length) {
    await db
      .update(openItems)
      .set({ status: 'dismissed', resolution: 'not known' })
      .where(and(eq(openItems.sessionId, sessionId), inArray(openItems.id, exhausted)));
  }
  // Refresh descriptions of existing gap items (step names can change).
  for (const g of gaps) {
    const item = byKey.get(g.gapKey);
    if (item && item.description !== g.description && (item.status === 'open' || item.status === 'asked')) {
      await db.update(openItems).set({ description: g.description }).where(eq(openItems.id, item.id));
    }
  }
}
