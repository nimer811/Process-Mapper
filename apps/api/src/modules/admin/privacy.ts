import {
  and,
  auditLog,
  disagreements,
  eq,
  evidence,
  inArray,
  interviewMessages,
  interviewSessions,
  isNull,
  lt,
  or,
  tasks,
  users,
  type Db,
} from '@process-ai/db';

export const REMOVED = '[Removed under the data retention policy]';

/**
 * Removes the words of these interviews: message text, quotes kept as evidence, and quotes in
 * disagreements. The process facts they produced stay (with their source marked as an interview).
 */
async function purgeTranscripts(db: Db, sessionIds: string[]) {
  if (!sessionIds.length) return 0;
  await db.transaction(async (tx) => {
    const messageIds = (
      await tx
        .select({ id: interviewMessages.id })
        .from(interviewMessages)
        .where(inArray(interviewMessages.sessionId, sessionIds))
    ).map((m) => m.id);
    await tx
      .update(interviewMessages)
      .set({ content: REMOVED, metadata: {} })
      .where(inArray(interviewMessages.sessionId, sessionIds));
    if (messageIds.length)
      await tx.update(evidence).set({ quote: null }).where(inArray(evidence.messageId, messageIds));
    await tx
      .update(disagreements)
      .set({ proposedQuote: null })
      .where(inArray(disagreements.sessionId, sessionIds));
    await tx
      .update(interviewSessions)
      .set({ transcriptPurgedAt: new Date(), runningSummary: null })
      .where(inArray(interviewSessions.id, sessionIds));
  });
  return sessionIds.length;
}

/** Transcripts of interviews completed more than `months` ago (0 = keep forever). */
export async function purgeExpiredTranscripts(db: Db, months: number) {
  if (months <= 0) return 0;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const due = await db
    .select({ id: interviewSessions.id })
    .from(interviewSessions)
    .where(
      and(
        eq(interviewSessions.status, 'completed'),
        lt(interviewSessions.lastActivityAt, cutoff),
        isNull(interviewSessions.transcriptPurgedAt),
      ),
    );
  return purgeTranscripts(
    db,
    due.map((s) => s.id),
  );
}

/** Everything stored about one person, for a data-access request. */
export async function exportPerson(db: Db, userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return null;
  const sessions = await db
    .select()
    .from(interviewSessions)
    .where(eq(interviewSessions.userId, userId));
  const messages = sessions.length
    ? await db
        .select()
        .from(interviewMessages)
        .where(
          inArray(
            interviewMessages.sessionId,
            sessions.map((s) => s.id),
          ),
        )
        .orderBy(interviewMessages.createdAt)
    : [];
  return {
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      department: user.departmentText,
      roles: user.roles,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    },
    interviews: sessions.map((s) => ({
      id: s.id,
      processId: s.processId,
      kind: s.kind,
      status: s.status,
      startedAt: s.createdAt,
      transcriptRemovedAt: s.transcriptPurgedAt,
      messages: messages
        .filter((m) => m.sessionId === s.id)
        .map((m) => ({ role: m.role, content: m.content, at: m.createdAt })),
    })),
    statementsUsedAsEvidence: await db
      .select({
        versionId: evidence.versionId,
        entityType: evidence.entityType,
        quote: evidence.quote,
        at: evidence.createdAt,
      })
      .from(evidence)
      .where(eq(evidence.providedBy, userId)),
    actions: await db
      .select({
        kind: tasks.kind,
        title: tasks.title,
        status: tasks.status,
        createdAt: tasks.createdAt,
      })
      .from(tasks)
      .where(eq(tasks.userId, userId)),
    activity: await db
      .select({
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        at: auditLog.createdAt,
      })
      .from(auditLog)
      .where(eq(auditLog.actorUserId, userId)),
  };
}

/**
 * The person left: their interview words and quotes are removed and their account is anonymised
 * and deactivated. Process facts, approvals and history stay, attributed to "Former employee".
 */
export async function erasePerson(db: Db, userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return null;
  const sessions = await db
    .select({ id: interviewSessions.id })
    .from(interviewSessions)
    .where(eq(interviewSessions.userId, userId));
  await purgeTranscripts(
    db,
    sessions.map((s) => s.id),
  );
  await db.update(evidence).set({ quote: null }).where(eq(evidence.providedBy, userId));
  await db
    .update(disagreements)
    .set({ currentQuote: null })
    .where(eq(disagreements.currentUserId, userId));
  await db
    .update(disagreements)
    .set({ proposedQuote: null })
    .where(or(eq(disagreements.proposedUserId, userId)));
  await db
    .update(users)
    .set({
      displayName: 'Former employee',
      email: `erased-${user.id}@invalid.local`,
      entraOid: null,
      departmentText: null,
      isActive: false,
      roles: ['user'],
      erasedAt: new Date(),
    })
    .where(eq(users.id, userId));
  return { interviews: sessions.length };
}
