import {
  and,
  asc,
  businessRules,
  controls,
  desc,
  disagreements,
  documentChunks,
  documents,
  eq,
  evidence,
  inArray,
  interviewMessages,
  interviewSessions,
  openItems,
  processEdges,
  processes,
  processSteps,
  processVersions,
  stepDependencies,
  stepSystems,
  users,
  validationEvents,
  type Db,
} from '@process-ai/db';
import { citationLabel } from '@process-ai/knowledge';
import type {
  Blocker,
  CurrentUser,
  EvidenceItem,
  HistoryEvent,
  LifecycleAction,
  Readiness,
  VersionDiff,
  VersionGraph,
} from '@process-ai/shared';
import { allowedActions, canEditVersion, checkTransition, type Actor } from './lifecycle.js';

export class GovernanceError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/** Loads a version with its process and the caller's role on it. */
export async function loadVersionContext(db: Db, user: CurrentUser, versionId: string) {
  const [row] = await db
    .select({ version: processVersions, process: processes })
    .from(processVersions)
    .innerJoin(processes, eq(processes.id, processVersions.processId))
    .where(eq(processVersions.id, versionId));
  if (!row) throw new GovernanceError(404, 'Version not found');
  const actor: Actor = {
    isAdmin: user.roles.includes('admin'),
    isOwner: row.process.ownerUserId === user.id,
    isCreator: row.version.createdBy === user.id || row.process.createdBy === user.id,
  };
  return { ...row, actor };
}

export type VersionContext = Awaited<ReturnType<typeof loadVersionContext>>;

// ---------- Readiness ----------

export async function computeBlockers(db: Db, ctx: VersionContext): Promise<Blocker[]> {
  const versionId = ctx.version.id;
  const [steps, edges, rules, contradictions] = await Promise.all([
    db.select().from(processSteps).where(eq(processSteps.versionId, versionId)),
    db.select().from(processEdges).where(eq(processEdges.versionId, versionId)),
    db.select().from(businessRules).where(eq(businessRules.versionId, versionId)),
    db
      .select()
      .from(openItems)
      .where(
        and(
          eq(openItems.versionId, versionId),
          eq(openItems.type, 'contradiction'),
          inArray(openItems.status, ['open', 'asked']),
        ),
      ),
  ]);
  const name = new Map(steps.map((s) => [s.id, `${s.stepKey} "${s.name}"`]));
  const blockers: Blocker[] = [];
  const add = (b: Omit<Blocker, 'blocking'> & { blocking?: boolean }) =>
    blockers.push({ blocking: true, ...b });

  if (!ctx.process.ownerUserId) {
    add({
      kind: 'no_owner',
      entityType: 'process',
      entityId: ctx.process.id,
      description: ctx.version.ownerRole
        ? `Assign a process owner to validate this process. The interview named "${ctx.version.ownerRole}" as accountable.`
        : 'Assign a process owner to validate this process.',
    });
  }
  for (const s of steps) {
    if (s.provenance === 'inferred')
      add({
        kind: 'inferred',
        entityType: 'step',
        entityId: s.id,
        description: `Step ${name.get(s.id)} was inferred by the AI. Confirm or remove it.`,
      });
    if (s.provenance === 'disputed')
      add({
        kind: 'disputed',
        entityType: 'step',
        entityId: s.id,
        description: `Step ${name.get(s.id)} is disputed. Confirm or correct it.`,
      });
  }
  for (const e of edges) {
    if (e.provenance === 'inferred' || e.provenance === 'disputed') {
      add({
        kind: e.provenance,
        entityType: 'edge',
        entityId: e.id,
        description: `Connection ${name.get(e.fromStepId)} → ${name.get(e.toStepId)} was ${e.provenance === 'inferred' ? 'inferred by the AI' : 'disputed'}. Confirm or remove it.`,
      });
    }
  }
  for (const r of rules) {
    if (r.provenance === 'inferred' || r.provenance === 'disputed') {
      add({
        kind: r.provenance,
        entityType: 'rule',
        entityId: r.id,
        description: `Rule "${r.statement}" was ${r.provenance === 'inferred' ? 'inferred by the AI' : 'disputed'}. Confirm or remove it.`,
      });
    }
  }
  // Controls the AI drafted are not fact until someone confirms them.
  for (const c of await db
    .select({ id: controls.id, key: controls.controlKey, name: controls.name })
    .from(controls)
    .where(and(eq(controls.versionId, versionId), eq(controls.provenance, 'inferred')))) {
    add({
      kind: 'inferred',
      entityType: 'control',
      entityId: c.id,
      description: `Control ${c.key} "${c.name}" was drafted by the AI. Confirm or remove it.`,
    });
  }
  // People described something differently: the owner settles it (the AI recommends).
  const differing = await db
    .select({ id: disagreements.id, subject: disagreements.subject })
    .from(disagreements)
    .where(and(eq(disagreements.versionId, versionId), eq(disagreements.status, 'open')));
  for (const d of differing) {
    add({
      kind: 'disagreement',
      entityType: 'disagreement',
      entityId: d.id,
      description: `Colleagues described ${d.subject} differently. Review the AI's recommendation and decide.`,
    });
  }
  for (const c of contradictions) {
    add({
      kind: 'contradiction',
      entityType: 'open_item',
      entityId: c.id,
      description: c.description,
    });
  }

  // Structure: worth fixing, but doesn't block validation.
  const warn = (description: string, entityId: string | null = null) =>
    add({
      kind: 'structure',
      entityType: entityId ? 'step' : 'process',
      entityId,
      description,
      blocking: false,
    });
  if (!steps.some((s) => s.type === 'start')) warn('The process has no start step.');
  if (!steps.some((s) => s.type === 'end')) warn('The process has no end step.');
  for (const s of steps) {
    const exits = edges.filter((e) => e.fromStepId === s.id).length;
    const entries = edges.filter((e) => e.toStepId === s.id).length;
    if (s.type === 'decision' && exits < 2)
      warn(`Decision ${name.get(s.id)} has fewer than two outcomes.`, s.id);
    else if (s.type !== 'end' && exits === 0) warn(`Nothing follows ${name.get(s.id)}.`, s.id);
    if (s.type !== 'start' && entries === 0) warn(`No step leads to ${name.get(s.id)}.`, s.id);
  }
  return blockers;
}

/** The most recent interview that produced this version, if any. */
export async function interviewFor(db: Db, versionId: string) {
  const [session] = await db
    .select()
    .from(interviewSessions)
    .where(eq(interviewSessions.versionId, versionId))
    .orderBy(desc(interviewSessions.createdAt))
    .limit(1);
  return session ?? null;
}

/** One As-Is and one To-Be can be in progress at a time. */
export async function openVersionExists(db: Db, processId: string, kind: 'as_is' | 'to_be') {
  const open = await db
    .select({ id: processVersions.id })
    .from(processVersions)
    .where(
      and(
        eq(processVersions.processId, processId),
        eq(processVersions.kind, kind),
        inArray(processVersions.status, ['draft', 'under_validation']),
      ),
    );
  return open.length > 0;
}

export async function readiness(db: Db, ctx: VersionContext): Promise<Readiness> {
  const blockers = await computeBlockers(db, ctx);
  const hasBlockers = blockers.some((b) => b.blocking);
  const isCurrent = ctx.process.currentVersionId === ctx.version.id;
  return {
    status: ctx.version.status,
    allowedActions: ctx.process.archivedAt
      ? []
      : allowedActions(ctx.version.status, ctx.actor, hasBlockers),
    canEdit: !ctx.process.archivedAt && canEditVersion(ctx.version.status, ctx.actor),
    canAssignOwner: ctx.actor.isAdmin,
    canCreateVersion:
      !ctx.process.archivedAt &&
      (ctx.actor.isAdmin || ctx.actor.isOwner) &&
      isCurrent &&
      !(await openVersionExists(db, ctx.process.id, 'as_is')),
    canDesignToBe:
      !ctx.process.archivedAt &&
      (ctx.actor.isAdmin || ctx.actor.isOwner) &&
      isCurrent &&
      ctx.version.kind === 'as_is' &&
      !(await openVersionExists(db, ctx.process.id, 'to_be')),
    canArchive: ctx.actor.isAdmin && !ctx.process.archivedAt,
    canInvite:
      !ctx.process.archivedAt &&
      (ctx.actor.isAdmin || ctx.actor.isOwner) &&
      (ctx.version.status === 'draft' || ctx.version.status === 'under_validation'),
    canSendBack:
      !ctx.process.archivedAt &&
      (ctx.actor.isAdmin || ctx.actor.isOwner) &&
      (ctx.version.status === 'draft' || ctx.version.status === 'under_validation') &&
      (await interviewFor(db, ctx.version.id))?.status === 'completed',
    blockers,
  };
}

// ---------- Transitions ----------

const EVENT: Record<LifecycleAction, 'submitted' | 'validated' | 'returned' | 'approved'> = {
  submit: 'submitted',
  validate: 'validated',
  return: 'returned',
  approve: 'approved',
};

/** Applies a lifecycle action with its side effects and an event in the version history. */
export async function transition(
  db: Db,
  ctx: VersionContext,
  userId: string,
  action: LifecycleAction,
  comment?: string,
) {
  const blockers = await computeBlockers(db, ctx);
  const check = checkTransition(ctx.version.status, action, ctx.actor, {
    hasBlockers: blockers.some((b) => b.blocking),
    comment,
  });
  if (!check.ok) throw new GovernanceError(check.status, check.reason);
  const v = ctx.version;
  const now = new Date();

  await db.transaction(async (tx) => {
    const set: Partial<typeof processVersions.$inferInsert> = { status: check.to };
    if (action === 'submit') set.submittedAt = now;
    if (action === 'validate') Object.assign(set, { validatedBy: userId, validatedAt: now });
    if (action === 'approve') Object.assign(set, { approvedBy: userId, approvedAt: now });
    await tx.update(processVersions).set(set).where(eq(processVersions.id, v.id));
    await tx.insert(validationEvents).values({
      versionId: v.id,
      action: EVENT[action],
      actorUserId: userId,
      comment: comment?.trim() || null,
    });

    if (action === 'validate') {
      // The owner vouches for the content: everything stated or documented becomes confirmed.
      for (const table of [processSteps, processEdges, businessRules]) {
        await tx
          .update(table)
          .set({ provenance: 'confirmed' })
          .where(
            and(eq(table.versionId, v.id), inArray(table.provenance, ['stated', 'documented'])),
          );
      }
      // A validated As-Is becomes current and archives the one it replaces. To-Be designs never
      // replace the documented current state.
      const previous = v.kind === 'as_is' ? ctx.process.currentVersionId : v.id;
      if (v.kind === 'as_is') {
        await tx
          .update(processes)
          .set({ currentVersionId: v.id })
          .where(eq(processes.id, ctx.process.id));
      }
      if (previous && previous !== v.id) {
        await tx
          .update(processVersions)
          .set({ status: 'archived' })
          .where(eq(processVersions.id, previous));
        await tx.insert(validationEvents).values({
          versionId: previous,
          action: 'archived',
          actorUserId: userId,
          comment: `Superseded by version ${v.versionNumber}`,
        });
      }
    }
  });
}

/** Archives the whole process (admin). */
export async function archiveProcess(db: Db, processId: string, userId: string, comment?: string) {
  await db.transaction(async (tx) => {
    const versions = await tx
      .select()
      .from(processVersions)
      .where(
        and(
          eq(processVersions.processId, processId),
          inArray(processVersions.status, ['draft', 'under_validation', 'validated', 'approved']),
        ),
      );
    await tx.update(processes).set({ archivedAt: new Date() }).where(eq(processes.id, processId));
    for (const v of versions) {
      await tx
        .update(processVersions)
        .set({ status: 'archived' })
        .where(eq(processVersions.id, v.id));
      await tx.insert(validationEvents).values({
        versionId: v.id,
        action: 'archived',
        actorUserId: userId,
        comment: comment?.trim() || 'Process archived',
      });
    }
  });
}

// ---------- New version ----------

/** Copies a validated/approved version into a new draft, keeping step keys and provenance history. */
export async function createVersion(
  db: Db,
  ctx: VersionContext,
  userId: string,
  changeSummary: string,
) {
  if (!(ctx.actor.isAdmin || ctx.actor.isOwner))
    throw new GovernanceError(403, 'Only the process owner or an admin can start a new version');
  if (ctx.process.currentVersionId !== ctx.version.id)
    throw new GovernanceError(409, 'New versions start from the current version');
  if (await openVersionExists(db, ctx.process.id, 'as_is'))
    throw new GovernanceError(409, 'There is already a version in progress for this process');

  return db.transaction(async (tx) => {
    const next = await cloneVersion(tx as unknown as Db, ctx.version, {
      kind: 'as_is',
      changeSummary,
      userId,
    });
    await tx.insert(validationEvents).values({
      versionId: next.id,
      action: 'reopened',
      actorUserId: userId,
      comment: changeSummary,
    });
    return next;
  });
}

/**
 * Copies a version's content (steps, connections, rules, systems and provenance) into a new draft
 * of the given kind. Step keys are kept, so versions — including As-Is vs To-Be — can be compared.
 * Call inside a transaction.
 */
export async function cloneVersion(
  tx: Db,
  src: typeof processVersions.$inferSelect,
  opts: {
    kind: 'as_is' | 'to_be';
    changeSummary: string;
    userId: string;
    designGoals?: string | null;
  },
) {
  {
    const { kind, changeSummary, userId } = opts;
    const [last] = await tx
      .select({ max: processVersions.versionNumber })
      .from(processVersions)
      .where(and(eq(processVersions.processId, src.processId), eq(processVersions.kind, kind)))
      .orderBy(desc(processVersions.versionNumber))
      .limit(1);
    const [next] = await tx
      .insert(processVersions)
      .values({
        processId: src.processId,
        versionNumber: (last?.max ?? 0) + 1,
        kind,
        designGoals: opts.designGoals ?? null,
        status: 'draft',
        basedOnVersionId: src.id,
        description: src.description,
        purpose: src.purpose,
        trigger: src.trigger,
        endCondition: src.endCondition,
        ownerRole: src.ownerRole,
        frequency: src.frequency,
        volume: src.volume,
        completenessScore: src.completenessScore,
        changeSummary,
        createdBy: userId,
      })
      .returning();
    const nv = next!.id;
    const ids = new Map<string, string>([[src.id, nv]]);

    const steps = await tx
      .select()
      .from(processSteps)
      .where(eq(processSteps.versionId, src.id))
      .orderBy(asc(processSteps.sequence));
    for (const s of steps) {
      const { id, versionId: _v, createdAt: _c, updatedAt: _u, ...rest } = s;
      const [copy] = await tx
        .insert(processSteps)
        .values({ ...rest, versionId: nv })
        .returning();
      ids.set(id, copy!.id);
    }
    const stepIds = steps.map((s) => s.id);
    if (stepIds.length) {
      for (const ss of await tx
        .select()
        .from(stepSystems)
        .where(inArray(stepSystems.stepId, stepIds))) {
        await tx.insert(stepSystems).values({ stepId: ids.get(ss.stepId)!, systemId: ss.systemId });
      }
      for (const d of await tx
        .select()
        .from(stepDependencies)
        .where(inArray(stepDependencies.stepId, stepIds))) {
        await tx
          .insert(stepDependencies)
          .values({ stepId: ids.get(d.stepId)!, dependsOnStepId: ids.get(d.dependsOnStepId)! });
      }
    }
    for (const e of await tx
      .select()
      .from(processEdges)
      .where(eq(processEdges.versionId, src.id))) {
      const { id, versionId: _v, createdAt: _c, updatedAt: _u, ...rest } = e;
      const [copy] = await tx
        .insert(processEdges)
        .values({
          ...rest,
          versionId: nv,
          fromStepId: ids.get(e.fromStepId)!,
          toStepId: ids.get(e.toStepId)!,
        })
        .returning();
      ids.set(id, copy!.id);
    }
    for (const r of await tx
      .select()
      .from(businessRules)
      .where(eq(businessRules.versionId, src.id))) {
      const { id, versionId: _v, createdAt: _c, updatedAt: _u, ...rest } = r;
      const [copy] = await tx
        .insert(businessRules)
        .values({ ...rest, versionId: nv, stepId: r.stepId ? ids.get(r.stepId)! : null })
        .returning();
      ids.set(id, copy!.id);
    }
    for (const c of await tx.select().from(controls).where(eq(controls.versionId, src.id))) {
      const { id, versionId: _v, createdAt: _c, updatedAt: _u, ...rest } = c;
      const [copy] = await tx
        .insert(controls)
        .values({
          ...rest,
          versionId: nv,
          ruleId: c.ruleId ? (ids.get(c.ruleId) ?? null) : null,
          stepIds: c.stepIds.flatMap((sid) => (ids.has(sid) ? [ids.get(sid)!] : [])),
        })
        .returning();
      ids.set(id, copy!.id);
    }
    // Provenance travels with the content.
    for (const ev of await tx.select().from(evidence).where(eq(evidence.versionId, src.id))) {
      const entityId = ids.get(ev.entityId);
      if (!entityId) continue;
      const { id: _id, ...rest } = ev;
      await tx.insert(evidence).values({ ...rest, versionId: nv, entityId });
    }
    return next!;
  }
}

// ---------- History & evidence ----------

export async function history(db: Db, versionId: string): Promise<HistoryEvent[]> {
  const rows = await db
    .select({
      e: validationEvents,
      actor: { id: users.id, displayName: users.displayName, email: users.email },
    })
    .from(validationEvents)
    .innerJoin(users, eq(users.id, validationEvents.actorUserId))
    .where(eq(validationEvents.versionId, versionId))
    .orderBy(asc(validationEvents.createdAt));
  return rows.map(({ e, actor }) => ({
    id: e.id,
    action: e.action,
    actor,
    comment: e.comment,
    createdAt: e.createdAt.toISOString(),
  }));
}

export async function evidenceFor(
  db: Db,
  versionId: string,
  entityId?: string,
): Promise<EvidenceItem[]> {
  const rows = await db
    .select({
      ev: evidence,
      user: { id: users.id, displayName: users.displayName, email: users.email },
      message: { sessionId: interviewMessages.sessionId, content: interviewMessages.content },
      chunk: {
        headingPath: documentChunks.headingPath,
        page: documentChunks.page,
        sheet: documentChunks.sheet,
      },
      doc: { id: documents.id, title: documents.title },
    })
    .from(evidence)
    .leftJoin(users, eq(users.id, evidence.providedBy))
    .leftJoin(interviewMessages, eq(interviewMessages.id, evidence.messageId))
    .leftJoin(documentChunks, eq(documentChunks.id, evidence.chunkId))
    .leftJoin(documents, eq(documents.id, documentChunks.documentId))
    .where(
      and(
        eq(evidence.versionId, versionId),
        entityId ? eq(evidence.entityId, entityId) : undefined,
      ),
    )
    .orderBy(asc(evidence.createdAt));
  return rows.map(({ ev, user, message, chunk, doc }) => ({
    id: ev.id,
    entityType: ev.entityType,
    entityId: ev.entityId,
    field: ev.field,
    sourceType: ev.sourceType,
    quote: ev.quote,
    providedBy: user?.id ? user : null,
    interviewId: message?.sessionId ?? null,
    messageExcerpt: !ev.quote && message?.content ? message.content.slice(0, 280) : null,
    document: doc?.id
      ? {
          id: doc.id,
          citation: citationLabel({
            documentTitle: doc.title,
            headingPath: chunk!.headingPath,
            page: chunk!.page,
            sheet: chunk!.sheet,
          }),
        }
      : null,
    createdAt: ev.createdAt.toISOString(),
  }));
}

// ---------- Comparison ----------

const stepFields = (s: VersionGraph['steps'][number]) => ({
  name: s.name,
  type: s.type,
  description: s.description,
  owner: s.actor?.name ?? null,
  systems:
    s.systems
      .map((x) => x.name)
      .sort()
      .join(', ') || null,
  inputs: s.inputs.join(', ') || null,
  outputs: s.outputs.join(', ') || null,
  execution: s.execution,
  duration: s.expectedDuration,
  SLA: s.sla,
  approver: s.approvalAuthority,
});

/** Differences between two versions, matching steps by their stable step key. */
export function diffVersions(a: VersionGraph, b: VersionGraph): VersionDiff {
  const metaFields = [
    'description',
    'purpose',
    'trigger',
    'endCondition',
    'ownerRole',
    'frequency',
    'volume',
  ] as const;
  const metadata = metaFields
    .filter((f) => (a[f] ?? null) !== (b[f] ?? null))
    .map((f) => ({ field: f, before: a[f] ?? null, after: b[f] ?? null }));

  const aSteps = new Map(a.steps.map((s) => [s.stepKey, s]));
  const bSteps = new Map(b.steps.map((s) => [s.stepKey, s]));
  const steps: VersionDiff['steps'] = [];
  for (const [key, s] of bSteps) {
    const prev = aSteps.get(key);
    if (!prev) {
      steps.push({ stepKey: key, name: s.name, change: 'added', fields: [] });
      continue;
    }
    const before = stepFields(prev);
    const after = stepFields(s);
    const fields = (Object.keys(after) as (keyof typeof after)[])
      .filter((f) => (before[f] ?? null) !== (after[f] ?? null))
      .map((f) => ({ field: f, before: before[f] ?? null, after: after[f] ?? null }));
    if (fields.length) steps.push({ stepKey: key, name: s.name, change: 'changed', fields });
  }
  for (const [key, s] of aSteps)
    if (!bSteps.has(key)) steps.push({ stepKey: key, name: s.name, change: 'removed', fields: [] });

  const edgeKey = (g: VersionGraph, e: VersionGraph['edges'][number]) => {
    const keyOf = new Map(g.steps.map((s) => [s.id, s.stepKey]));
    return `${keyOf.get(e.fromStepId)}→${keyOf.get(e.toStepId)}`;
  };
  const describe = (g: VersionGraph, e: VersionGraph['edges'][number]) => {
    const nameOf = new Map(g.steps.map((s) => [s.id, s.name]));
    return `${nameOf.get(e.fromStepId)} → ${nameOf.get(e.toStepId)}${e.conditionLabel ? ` ("${e.conditionLabel}")` : ''}`;
  };
  const aEdges = new Map(a.edges.map((e) => [edgeKey(a, e), e]));
  const bEdges = new Map(b.edges.map((e) => [edgeKey(b, e), e]));
  const connections: VersionDiff['connections'] = [];
  for (const [k, e] of bEdges) {
    const prev = aEdges.get(k);
    if (!prev) connections.push({ description: describe(b, e), change: 'added' });
    else if (prev.type !== e.type || (prev.conditionLabel ?? '') !== (e.conditionLabel ?? ''))
      connections.push({ description: describe(b, e), change: 'changed' });
  }
  for (const [k, e] of aEdges)
    if (!bEdges.has(k)) connections.push({ description: describe(a, e), change: 'removed' });

  const norm = (s: string) => s.trim().toLowerCase();
  const aRules = new Set(a.rules.map((r) => norm(r.statement)));
  const bRules = new Set(b.rules.map((r) => norm(r.statement)));
  const rules: VersionDiff['rules'] = [
    ...b.rules
      .filter((r) => !aRules.has(norm(r.statement)))
      .map((r) => ({ statement: r.statement, change: 'added' as const })),
    ...a.rules
      .filter((r) => !bRules.has(norm(r.statement)))
      .map((r) => ({ statement: r.statement, change: 'removed' as const })),
  ];

  return {
    from: { id: a.id, versionNumber: a.versionNumber },
    to: { id: b.id, versionNumber: b.versionNumber },
    metadata,
    steps,
    connections,
    rules,
  };
}
