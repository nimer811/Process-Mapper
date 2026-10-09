import {
  and,
  desc,
  documentChunks,
  documents,
  eq,
  evidence,
  inArray,
  isNotNull,
  openItems,
  processAlerts,
  processes,
  processVersions,
  sopDocuments,
  sql,
  type Db,
} from '@process-ai/db';
import type { ProcessAlert, ReviewState } from '@process-ai/shared';
import { closeTasks, openTask } from '../tasks/service.js';

/** The owner is reminded this many days before a review is due. */
export const REVIEW_NOTICE_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

const addMonths = (d: Date, n: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
};

/** The version in force (current validated/approved As-Is) and when it was last reviewed. */
async function current(db: Db, processId: string) {
  const p = await db.query.processes.findFirst({ where: eq(processes.id, processId) });
  if (!p?.currentVersionId) return { p, v: null, last: null as Date | null };
  const v = await db.query.processVersions.findFirst({
    where: eq(processVersions.id, p.currentVersionId),
  });
  const last = v ? (v.reviewedAt ?? v.approvedAt ?? v.validatedAt) : null;
  return { p, v, last };
}

export function reviewStatus(last: Date | null, cycleMonths: number, now = new Date()) {
  if (!last) return { status: 'not_applicable' as const, dueAt: null };
  const dueAt = addMonths(last, cycleMonths);
  const status =
    dueAt <= now
      ? ('overdue' as const)
      : dueAt.getTime() - now.getTime() <= REVIEW_NOTICE_DAYS * DAY
        ? ('due_soon' as const)
        : ('ok' as const);
  return { status, dueAt };
}

const toAlert = (a: typeof processAlerts.$inferSelect): ProcessAlert => ({
  id: a.id,
  kind: a.kind,
  documentId: a.documentId,
  documentTitle: a.documentTitle,
  change: a.change,
  status: a.status,
  resolution: a.resolution,
  createdAt: a.createdAt.toISOString(),
});

export async function reviewState(
  db: Db,
  processId: string,
  canManage: boolean,
): Promise<ReviewState> {
  const { p, v, last } = await current(db, processId);
  const cycleMonths = p?.reviewCycleMonths ?? 12;
  const { status, dueAt } = reviewStatus(last, cycleMonths);
  const alerts = await db
    .select()
    .from(processAlerts)
    .where(eq(processAlerts.processId, processId))
    .orderBy(desc(processAlerts.createdAt))
    .limit(20);
  return {
    status,
    lastReviewedAt: last?.toISOString() ?? null,
    dueAt: dueAt?.toISOString() ?? null,
    cycleMonths,
    canReview: canManage && !!v && !p?.archivedAt,
    alerts: alerts.map(toAlert),
  };
}

/** The owner confirms the process still reflects reality: the review clock restarts. */
export async function markReviewed(db: Db, processId: string, userId: string) {
  const { v } = await current(db, processId);
  if (!v) return false;
  await db
    .update(processVersions)
    .set({ reviewedAt: new Date(), reviewedBy: userId })
    .where(eq(processVersions.id, v.id));
  await closeTasks(db, { kinds: ['review_due'], versionId: v.id });
  return v;
}

/** Review reminders for processes this person owns (opened lazily when their inbox is read). */
export async function refreshReviewTasks(db: Db, userId: string) {
  const owned = await db
    .select({ p: processes, v: processVersions })
    .from(processes)
    .innerJoin(processVersions, eq(processVersions.id, processes.currentVersionId))
    .where(and(eq(processes.ownerUserId, userId), sql`${processes.archivedAt} is null`));
  for (const { p, v } of owned) {
    const { status, dueAt } = reviewStatus(
      v.reviewedAt ?? v.approvedAt ?? v.validatedAt,
      p.reviewCycleMonths,
    );
    if (status === 'due_soon' || status === 'overdue') {
      await openTask(db, {
        userId,
        kind: 'review_due',
        title: `${status === 'overdue' ? 'Review overdue' : 'Review due'}: "${p.name}"`,
        detail: `Due ${dueAt!.toISOString().slice(0, 10)}. Check the process still reflects how work is done; mark it reviewed or start a new version.`,
        link: `/processes/${p.id}`,
        processId: p.id,
        versionId: v.id,
      });
    } else {
      await closeTasks(db, { kinds: ['review_due'], versionId: v.id });
    }
  }
}

/**
 * Processes that rely on a document: linked to it, citing it in their current or in-progress map
 * (evidence or SOP contradictions), excluding the process whose own published SOP it is.
 */
async function processesRelyingOn(db: Db, documentId: string) {
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!doc) return [];
  const ids = new Set<string>();
  if (doc.processId) ids.add(doc.processId);
  const chunkIds = (
    await db
      .select({ id: documentChunks.id })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, documentId))
  ).map((c) => c.id);
  if (chunkIds.length) {
    const cited = await db
      .selectDistinct({ processId: processVersions.processId })
      .from(evidence)
      .innerJoin(processVersions, eq(processVersions.id, evidence.versionId))
      .where(
        and(
          inArray(evidence.chunkId, chunkIds),
          inArray(processVersions.status, ['draft', 'under_validation', 'validated', 'approved']),
        ),
      );
    const contradicted = await db
      .selectDistinct({ processId: processVersions.processId })
      .from(openItems)
      .innerJoin(processVersions, eq(processVersions.id, openItems.versionId))
      .where(and(isNotNull(openItems.chunkId), inArray(openItems.chunkId, chunkIds)));
    for (const r of [...cited, ...contradicted]) ids.add(r.processId);
  }
  // A process's own published SOP changing (e.g. on re-publishing) is not news to it.
  const own = await db
    .select({ processId: processVersions.processId })
    .from(sopDocuments)
    .innerJoin(processVersions, eq(processVersions.id, sopDocuments.versionId))
    .where(eq(sopDocuments.knowledgeDocumentId, documentId));
  for (const o of own) ids.delete(o.processId);
  return [...ids];
}

/** Earlier active documents this upload replaces: same title (case-insensitive) in the same knowledge base. */
export async function replacedDocuments(db: Db, documentId: string) {
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!doc) return [];
  return db
    .select({ id: documents.id, title: documents.title })
    .from(documents)
    .where(
      and(
        sql`lower(${documents.title}) = lower(${doc.title})`,
        doc.knowledgeBaseId ? eq(documents.knowledgeBaseId, doc.knowledgeBaseId) : sql`true`,
        sql`${documents.id} <> ${doc.id}`,
      ),
    );
}

/**
 * A document changed (new version uploaded, edited, deactivated, deleted): every process relying on
 * it gets an alert and its owner (or admins) an action to check the impact.
 */
export async function flagDocumentChange(db: Db, documentId: string, change: string) {
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!doc) return 0;
  const affected = await processesRelyingOn(db, documentId);
  for (const processId of affected) {
    const p = await db.query.processes.findFirst({ where: eq(processes.id, processId) });
    if (!p || p.archivedAt) continue;
    const [existing] = await db
      .select()
      .from(processAlerts)
      .where(
        and(
          eq(processAlerts.processId, processId),
          eq(processAlerts.documentId, documentId),
          eq(processAlerts.status, 'open'),
        ),
      );
    if (existing) {
      await db.update(processAlerts).set({ change }).where(eq(processAlerts.id, existing.id));
    } else {
      await db.insert(processAlerts).values({
        processId,
        kind: 'document_changed',
        documentId,
        documentTitle: doc.title,
        change,
      });
    }
    await syncAlertTask(db, processId);
  }
  return affected.length;
}

/** One "check the change" action per process while it has open alerts (owner, else admins). */
export async function syncAlertTask(db: Db, processId: string) {
  const p = await db.query.processes.findFirst({ where: eq(processes.id, processId) });
  if (!p) return;
  const open = await db
    .select({ title: processAlerts.documentTitle })
    .from(processAlerts)
    .where(and(eq(processAlerts.processId, processId), eq(processAlerts.status, 'open')));
  const versionId = p.currentVersionId;
  if (!open.length) {
    await closeTasks(db, { kinds: ['check_change'], processId });
    return;
  }
  const admins = p.ownerUserId
    ? [p.ownerUserId]
    : (
        await db.query.users.findMany({
          where: (u, { and: a, eq: e }) => a(e(u.isActive, true), sql`'admin' = any(${u.roles})`),
        })
      ).map((u) => u.id);
  for (const userId of admins) {
    await openTask(db, {
      userId,
      kind: 'check_change',
      title: `Check "${p.name}": ${open.length === 1 ? `"${open[0]!.title}" changed` : `${open.length} documents changed`}`,
      detail:
        'A document this process relies on changed. Check whether the process or its SOP needs updating.',
      link: `/processes/${p.id}`,
      processId: p.id,
      versionId,
    });
  }
}

export async function resolveAlert(db: Db, alertId: string, userId: string, resolution: string) {
  const [a] = await db
    .update(processAlerts)
    .set({ status: 'resolved', resolution, resolvedBy: userId, resolvedAt: new Date() })
    .where(eq(processAlerts.id, alertId))
    .returning();
  if (a) await syncAlertTask(db, a.processId);
  return a ?? null;
}
