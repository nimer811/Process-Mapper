import {
  aliasedTable,
  and,
  asc,
  desc,
  disagreements,
  eq,
  inArray,
  interviewSessions,
  users,
  type Db,
} from '@process-ai/db';
import type { Contributor, Disagreement } from '@process-ai/shared';

/** Everyone whose interview feeds this version, first interviewee first. */
export async function listContributors(db: Db, versionId: string): Promise<Contributor[]> {
  const rows = await db
    .select({
      session: interviewSessions,
      user: { id: users.id, displayName: users.displayName, department: users.departmentText },
    })
    .from(interviewSessions)
    .innerJoin(users, eq(users.id, interviewSessions.userId))
    .where(eq(interviewSessions.versionId, versionId))
    .orderBy(asc(interviewSessions.createdAt));
  const inviterIds = [
    ...new Set(rows.flatMap((r) => (r.session.invitedBy ? [r.session.invitedBy] : []))),
  ];
  const inviters = inviterIds.length
    ? await db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, inviterIds))
    : [];
  return rows.map(({ session: s, user: u }) => ({
    sessionId: s.id,
    user: u,
    kind: s.kind,
    focus: s.focus,
    invitedBy: inviters.find((i) => i.id === s.invitedBy)?.displayName ?? null,
    stage: s.stage,
    status: s.status,
    turnCount: s.turnCount,
    lastActivityAt: s.lastActivityAt.toISOString(),
  }));
}

const proposer = aliasedTable(users, 'proposer');

export async function listDisagreements(
  db: Db,
  versionId: string,
  onlyOpen = false,
): Promise<Disagreement[]> {
  const rows = await db
    .select({
      d: disagreements,
      current: { id: users.id, displayName: users.displayName, department: users.departmentText },
      proposed: {
        id: proposer.id,
        displayName: proposer.displayName,
        department: proposer.departmentText,
      },
    })
    .from(disagreements)
    .leftJoin(users, eq(users.id, disagreements.currentUserId))
    .leftJoin(proposer, eq(proposer.id, disagreements.proposedUserId))
    .where(
      and(
        eq(disagreements.versionId, versionId),
        onlyOpen ? eq(disagreements.status, 'open') : undefined,
      ),
    )
    .orderBy(desc(disagreements.status), asc(disagreements.createdAt));
  const person = (u: { id: string; displayName: string; department: string | null } | null) =>
    u?.id ? u : null;
  return rows.map(({ d, current, proposed }) => ({
    id: d.id,
    entityType: d.entityType,
    entityId: d.entityId,
    subject: d.subject,
    field: d.field,
    current: { value: d.currentValue, user: person(current), quote: d.currentQuote },
    proposed: { value: d.proposedValue, user: person(proposed), quote: d.proposedQuote },
    recommendation: d.recommendation ?? null,
    status: d.status,
    resolution: d.resolution,
    createdAt: d.createdAt.toISOString(),
  }));
}

/** The latest interview this person had on this version. */
export async function sessionOf(db: Db, versionId: string, userId: string) {
  const [s] = await db
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.versionId, versionId), eq(interviewSessions.userId, userId)))
    .orderBy(desc(interviewSessions.createdAt))
    .limit(1);
  return s ?? null;
}
