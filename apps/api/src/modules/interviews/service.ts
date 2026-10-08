import {
  and,
  asc,
  departments,
  desc,
  eq,
  inArray,
  interviewMessages,
  interviewSessions,
  openItems,
  processes,
  processVersions,
  type Db,
  users,
} from '@process-ai/db';
import type { CurrentUser, InterviewDetail, InterviewSummary } from '@process-ai/shared';

const summarySelect = {
  session: interviewSessions,
  processName: processes.name,
  departmentName: departments.name,
  completeness: processVersions.completenessScore,
  user: { id: users.id, displayName: users.displayName },
};

type SummaryRow = {
  session: typeof interviewSessions.$inferSelect;
  processName: string;
  departmentName: string;
  completeness: number | null;
  user: { id: string; displayName: string };
};

const toSummary = (r: SummaryRow): InterviewSummary => ({
  id: r.session.id,
  processId: r.session.processId,
  processName: r.processName,
  departmentName: r.departmentName,
  versionId: r.session.versionId,
  user: r.user,
  stage: r.session.stage,
  status: r.session.status,
  completeness: r.completeness,
  turnCount: r.session.turnCount,
  lastActivityAt: r.session.lastActivityAt.toISOString(),
  createdAt: r.session.createdAt.toISOString(),
});

function baseQuery(db: Db) {
  return db
    .select(summarySelect)
    .from(interviewSessions)
    .innerJoin(processes, eq(processes.id, interviewSessions.processId))
    .innerJoin(departments, eq(departments.id, processes.departmentId))
    .innerJoin(processVersions, eq(processVersions.id, interviewSessions.versionId))
    .innerJoin(users, eq(users.id, interviewSessions.userId));
}

/** The user's own interviews, or every interview for admins when `all` is set. */
export async function listInterviews(db: Db, user: CurrentUser, all: boolean) {
  const rows = await baseQuery(db)
    .where(all && user.roles.includes('admin') ? undefined : eq(interviewSessions.userId, user.id))
    .orderBy(desc(interviewSessions.lastActivityAt))
    .limit(200);
  return rows.map(toSummary);
}

/** Session owner or admin may view; only the owner may continue the conversation. */
export async function getAccessibleSession(db: Db, user: CurrentUser, id: string) {
  const [row] = await baseQuery(db).where(eq(interviewSessions.id, id));
  if (!row) return null;
  const isOwner = row.session.userId === user.id;
  if (!isOwner && !user.roles.includes('admin')) return null;
  return { summary: toSummary(row), isOwner };
}

export async function getInterviewDetail(
  db: Db,
  summary: InterviewSummary,
  aiAvailable: boolean,
): Promise<InterviewDetail> {
  const [messages, items] = await Promise.all([
    db
      .select()
      .from(interviewMessages)
      .where(eq(interviewMessages.sessionId, summary.id))
      .orderBy(asc(interviewMessages.createdAt)),
    db
      .select()
      .from(openItems)
      .where(and(eq(openItems.sessionId, summary.id), inArray(openItems.status, ['open', 'asked'])))
      .orderBy(desc(openItems.priority)),
  ]);
  return {
    ...summary,
    aiAvailable,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      citations: (
        (m.metadata as { citations?: { documentId: string; label: string }[] }).citations ?? []
      ).map((c) => ({
        documentId: c.documentId,
        label: c.label,
      })),
    })),
    openItems: items.map((i) => ({
      id: i.id,
      type: i.type,
      description: i.description,
      status: i.status,
      rationale: i.rationale,
      entityId: i.entityId,
      timesAsked: i.timesAsked,
    })),
  };
}
