import {
  and,
  arrayContains,
  count,
  disagreements,
  desc,
  eq,
  inArray,
  interviewSessions,
  lt,
  ne,
  notInArray,
  or,
  processes,
  processVersions,
  sql,
  tasks,
  users,
  type Db,
} from '@process-ai/db';
import type { Task, TaskKind } from '@process-ai/shared';

/** An unfinished interview with no activity for this long gets a nudge. */
export const NUDGE_AFTER_DAYS = 3;

/** Kinds that close themselves when the action is done (the others can be dismissed). */
const LIFECYCLE_KINDS: TaskKind[] = [
  'confirm_points',
  'assign_owner',
  'validate',
  'approve',
  'add_view',
  'resolve_disagreements',
];

/**
 * Delivery outside the app (email, Teams). Not configured for the pilot: tasks show in the inbox
 * only. A provider plugs in here later without touching the callers.
 */
export interface Notifier {
  taskOpened(task: { userId: string; title: string; link: string }): Promise<void>;
}
export const noNotifier: Notifier = { taskOpened: async () => {} };

interface NewTask {
  userId: string;
  kind: TaskKind;
  title: string;
  detail?: string | null;
  link: string;
  processId?: string | null;
  versionId?: string | null;
  sessionId?: string | null;
}

/** Opens a task unless the same one (person, kind, subject) is already open. */
export async function openTask(db: Db, t: NewTask, notifier: Notifier = noNotifier) {
  const [row] = await db
    .insert(tasks)
    .values({
      ...t,
      detail: t.detail ?? null,
      processId: t.processId ?? null,
      versionId: t.versionId ?? null,
      sessionId: t.sessionId ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (row) await notifier.taskOpened(row).catch(() => {});
  return row ?? null;
}

/** Closes open tasks matching the filter. */
export async function closeTasks(
  db: Db,
  filter: { kinds: TaskKind[]; versionId?: string; sessionId?: string; keepIds?: string[] },
  status: 'done' | 'dismissed' = 'done',
) {
  await db
    .update(tasks)
    .set({ status, completedAt: new Date() })
    .where(
      and(
        eq(tasks.status, 'open'),
        inArray(tasks.kind, filter.kinds),
        filter.versionId ? eq(tasks.versionId, filter.versionId) : undefined,
        filter.sessionId ? eq(tasks.sessionId, filter.sessionId) : undefined,
        filter.keepIds?.length ? notInArray(tasks.id, filter.keepIds) : undefined,
      ),
    );
}

/**
 * Brings a version's review tasks in line with its state: under validation → the owner validates
 * (or admins assign an owner first); validated → admins approve. Anything no longer needed closes.
 */
export async function syncVersionTasks(db: Db, versionId: string, notifier: Notifier = noNotifier) {
  const [row] = await db
    .select({ version: processVersions, process: processes })
    .from(processVersions)
    .innerJoin(processes, eq(processes.id, processVersions.processId))
    .where(eq(processVersions.id, versionId));
  if (!row) return;
  const { version: v, process: p } = row;
  const base = { processId: p.id, versionId: v.id, link: `/processes/${p.id}` };
  const admins = async () =>
    (
      await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.isActive, true), arrayContains(users.roles, ['admin'])))
    ).map((u) => u.id);

  const wanted: NewTask[] = [];
  if (!p.archivedAt && v.status === 'under_validation') {
    if (p.ownerUserId) {
      wanted.push({
        ...base,
        userId: p.ownerUserId,
        kind: 'validate',
        title: `Validate "${p.name}"`,
        detail: `Version ${v.versionNumber} was submitted for validation. Check the map and resolve what's listed under "Review before validation".`,
      });
    } else {
      for (const id of await admins()) {
        wanted.push({
          ...base,
          userId: id,
          kind: 'assign_owner',
          title: `Assign an owner to "${p.name}"`,
          detail: v.ownerRole
            ? `It's waiting for validation. The interview named "${v.ownerRole}" as accountable.`
            : "It's waiting for validation and has no process owner yet.",
        });
      }
    }
  }
  if (!p.archivedAt && v.status === 'validated') {
    for (const id of await admins()) {
      wanted.push({
        ...base,
        userId: id,
        kind: 'approve',
        title: `Approve "${p.name}"`,
        detail: `Version ${v.versionNumber} was validated by the process owner and is waiting for approval.`,
      });
    }
  }

  // Colleagues described something differently: the owner (or admins, until there is one) settles it.
  const [{ n: differing } = { n: 0 }] = await db
    .select({ n: count() })
    .from(disagreements)
    .where(and(eq(disagreements.versionId, v.id), eq(disagreements.status, 'open')));
  if (!p.archivedAt && differing > 0 && (v.status === 'draft' || v.status === 'under_validation')) {
    for (const id of p.ownerUserId ? [p.ownerUserId] : await admins()) {
      wanted.push({
        ...base,
        userId: id,
        kind: 'resolve_disagreements',
        title: `Settle ${differing} difference${differing === 1 ? '' : 's'} on "${p.name}"`,
        detail:
          'Colleagues described parts of this process differently. The AI has a recommendation for each; you decide.',
      });
    }
  }

  const keep: string[] = [];
  for (const t of wanted) {
    const opened = await openTask(db, t, notifier);
    if (opened) keep.push(opened.id);
  }
  const stillOpen = await db
    .select({ id: tasks.id, userId: tasks.userId, kind: tasks.kind })
    .from(tasks)
    .where(and(eq(tasks.versionId, v.id), eq(tasks.status, 'open')));
  for (const t of stillOpen) {
    if (wanted.some((w) => w.userId === t.userId && w.kind === t.kind)) keep.push(t.id);
  }
  await closeTasks(db, {
    kinds: ['assign_owner', 'validate', 'approve', 'resolve_disagreements'],
    versionId: v.id,
    keepIds: keep,
  });
}

/** Review tasks for every version of a process (owner changed, archived). */
export async function syncProcessTasks(db: Db, processId: string) {
  const rows = await db
    .select({ id: processVersions.id })
    .from(processVersions)
    .where(eq(processVersions.processId, processId));
  for (const r of rows) await syncVersionTasks(db, r.id);
}

/** Interview sent back from validation: the interviewee is asked to confirm the open points. */
export async function openConfirmTask(
  db: Db,
  session: { id: string; userId: string; processId: string; versionId: string },
  processName: string,
  comment: string | null,
  notifier: Notifier = noNotifier,
) {
  await openTask(
    db,
    {
      userId: session.userId,
      kind: 'confirm_points',
      title: `Confirm a few points on "${processName}"`,
      detail: comment
        ? `The process owner asked: "${comment}"`
        : 'The process owner needs a few points confirmed before validation.',
      link: `/interviews/${session.id}`,
      processId: session.processId,
      versionId: session.versionId,
      sessionId: session.id,
    },
    notifier,
  );
}

/** The interview finished: nothing left for the interviewee to do on it. */
export async function closeInterviewTasks(db: Db, sessionId: string) {
  await closeTasks(db, { kinds: ['confirm_points', 'continue_interview', 'add_view'], sessionId });
}

/** Nudges for this person's unfinished interviews that went quiet; closes nudges that no longer apply. */
export async function refreshNudges(db: Db, userId: string) {
  const cutoff = new Date(Date.now() - NUDGE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const quiet = await db
    .select({ session: interviewSessions, processName: processes.name })
    .from(interviewSessions)
    .innerJoin(processes, eq(processes.id, interviewSessions.processId))
    .where(
      and(
        eq(interviewSessions.userId, userId),
        ne(interviewSessions.status, 'completed'),
        ne(interviewSessions.stage, 'completed'),
        lt(interviewSessions.lastActivityAt, cutoff),
      ),
    );
  for (const { session: s, processName } of quiet) {
    await openTask(db, {
      userId,
      kind: 'continue_interview',
      title: `Finish your interview on "${processName}"`,
      detail: 'Everything so far is saved. Pick up where you left off.',
      link: `/interviews/${s.id}`,
      processId: s.processId,
      versionId: s.versionId,
      sessionId: s.id,
    });
  }
  // Active again or finished: the nudge is no longer needed.
  const open = await db
    .select({ id: tasks.id, sessionId: tasks.sessionId })
    .from(tasks)
    .where(
      and(eq(tasks.userId, userId), eq(tasks.kind, 'continue_interview'), eq(tasks.status, 'open')),
    );
  const stale = open
    .filter((t) => !quiet.some((q) => q.session.id === t.sessionId))
    .map((t) => t.id);
  if (stale.length) {
    await db
      .update(tasks)
      .set({ status: 'done', completedAt: new Date() })
      .where(inArray(tasks.id, stale));
  }
}

/** Open tasks first (newest first), then the most recent finished ones. */
export async function listTasks(db: Db, userId: string): Promise<Task[]> {
  await refreshNudges(db, userId);
  const rows = await db
    .select({ task: tasks, processName: processes.name })
    .from(tasks)
    .leftJoin(processes, eq(processes.id, tasks.processId))
    .where(
      and(
        eq(tasks.userId, userId),
        or(eq(tasks.status, 'open'), sql`${tasks.completedAt} > now() - interval '14 days'`),
      ),
    )
    .orderBy(sql`${tasks.status} = 'open' desc`, desc(tasks.createdAt))
    .limit(100);
  return rows.map(({ task: t, processName }) => ({
    id: t.id,
    kind: t.kind,
    title: t.title,
    detail: t.detail,
    link: t.link,
    processName,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    completedAt: t.completedAt?.toISOString() ?? null,
    dismissible: !LIFECYCLE_KINDS.includes(t.kind),
  }));
}

/** Versions that may need review tasks (used once at startup to cover data from before the inbox). */
export async function syncAllVersionTasks(db: Db) {
  const rows = await db
    .select({ id: processVersions.id })
    .from(processVersions)
    .where(inArray(processVersions.status, ['under_validation', 'validated']));
  for (const r of rows) await syncVersionTasks(db, r.id);
}
