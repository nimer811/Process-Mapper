import {
  and,
  businessRules,
  eq,
  evidence,
  openItems,
  processEdges,
  processSteps,
  processVersions,
  stepSystems,
  upsertActor,
  upsertSystem,
  type Db,
} from '@process-ai/db';
import type { EdgeInput, RuleInput, StepInput, VersionMetaPatch } from '@process-ai/shared';
import { canEditVersion } from './lifecycle.js';
import { GovernanceError, type VersionContext } from './service.js';

/** Edits are only allowed on drafts/versions under validation, by the right people. */
export function assertEditable(ctx: VersionContext) {
  if (ctx.process.archivedAt) throw new GovernanceError(409, 'This process is archived');
  if (!canEditVersion(ctx.version.status, ctx.actor)) {
    throw new GovernanceError(
      ctx.version.status === 'validated' ||
        ctx.version.status === 'approved' ||
        ctx.version.status === 'archived'
        ? 409
        : 403,
      ctx.version.status === 'validated' || ctx.version.status === 'approved'
        ? 'This version is locked. Start a new version to make changes.'
        : "You don't have permission to edit this version",
    );
  }
}

/** Every edit bumps the version's updatedAt (the map layout is cached on it) and records evidence. */
async function touch(tx: Db, versionId: string) {
  await tx
    .update(processVersions)
    .set({ updatedAt: new Date() })
    .where(eq(processVersions.id, versionId));
}

async function record(
  tx: Db,
  ctx: VersionContext,
  userId: string,
  entityType: string,
  entityId: string,
  field: string | null,
  source: 'manual_edit' | 'user_validation' = 'manual_edit',
) {
  await tx.insert(evidence).values({
    versionId: ctx.version.id,
    entityType,
    entityId,
    field,
    sourceType: source,
    providedBy: userId,
  });
}

async function stepOf(tx: Db, ctx: VersionContext, stepId: string) {
  const step = await tx.query.processSteps.findFirst({
    where: and(eq(processSteps.id, stepId), eq(processSteps.versionId, ctx.version.id)),
  });
  if (!step) throw new GovernanceError(404, 'Step not found in this version');
  return step;
}

async function setSystems(tx: Db, stepId: string, names: string[]) {
  await tx.delete(stepSystems).where(eq(stepSystems.stepId, stepId));
  for (const name of [...new Set(names.map((n) => n.trim()).filter(Boolean))]) {
    await tx
      .insert(stepSystems)
      .values({ stepId, systemId: await upsertSystem(tx, name) })
      .onConflictDoNothing();
  }
}

export function updateMetadata(
  db: Db,
  ctx: VersionContext,
  userId: string,
  patch: VersionMetaPatch,
) {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    await tx.update(processVersions).set(patch).where(eq(processVersions.id, ctx.version.id));
    await record(t, ctx, userId, 'process_version', ctx.version.id, Object.keys(patch).join(','));
  });
}

export function addStep(db: Db, ctx: VersionContext, userId: string, input: StepInput) {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const existing = await tx
      .select({ key: processSteps.stepKey, seq: processSteps.sequence })
      .from(processSteps)
      .where(eq(processSteps.versionId, ctx.version.id));
    const nextKey =
      Math.max(0, ...existing.map((s) => Number(/^S(\d+)$/.exec(s.key)?.[1] ?? 0))) + 1;
    const nextSeq = Math.max(0, ...existing.map((s) => s.seq ?? 0)) + 1;
    if (input.afterStepId) await stepOf(t, ctx, input.afterStepId);
    const [step] = await tx
      .insert(processSteps)
      .values({
        versionId: ctx.version.id,
        stepKey: `S${nextKey}`,
        sequence: nextSeq,
        type: input.type,
        name: input.name,
        description: input.description ?? null,
        actorId: input.actor ? await upsertActor(t, input.actor) : null,
        inputs: input.inputs ?? [],
        outputs: input.outputs ?? [],
        execution: input.execution ?? 'unknown',
        expectedDuration: input.expectedDuration ?? null,
        sla: input.sla ?? null,
        approvalAuthority: input.approvalAuthority ?? null,
        painPoints: input.painPoints ?? [],
        provenance: 'confirmed',
      })
      .returning();
    await setSystems(t, step!.id, input.systems ?? []);
    if (input.afterStepId) {
      await tx.insert(processEdges).values({
        versionId: ctx.version.id,
        fromStepId: input.afterStepId,
        toStepId: step!.id,
        type: 'sequence',
        provenance: 'confirmed',
      });
    }
    await record(t, ctx, userId, 'step', step!.id, null);
    await touch(t, ctx.version.id);
    return step!;
  });
}

export function updateStep(
  db: Db,
  ctx: VersionContext,
  userId: string,
  stepId: string,
  input: Partial<StepInput>,
) {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    await stepOf(t, ctx, stepId);
    const { actor, systems, afterStepId: _ignored, ...fields } = input;
    const set: Partial<typeof processSteps.$inferInsert> = { ...fields, provenance: 'confirmed' };
    if (actor !== undefined) set.actorId = actor ? await upsertActor(t, actor) : null;
    if (systems !== undefined) {
      await setSystems(t, stepId, systems);
      set.noSystem = systems.length === 0;
    }
    await tx.update(processSteps).set(set).where(eq(processSteps.id, stepId));
    await record(t, ctx, userId, 'step', stepId, Object.keys(input).join(','));
    await touch(t, ctx.version.id);
  });
}

export function deleteStep(db: Db, ctx: VersionContext, stepId: string) {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    await stepOf(t, ctx, stepId);
    await tx.delete(processSteps).where(eq(processSteps.id, stepId)); // connections and step rules cascade
    await tx
      .update(openItems)
      .set({ status: 'resolved', resolution: 'step removed' })
      .where(eq(openItems.entityId, stepId));
    await touch(t, ctx.version.id);
  });
}

export function addEdge(db: Db, ctx: VersionContext, userId: string, input: EdgeInput) {
  if (input.fromStepId === input.toStepId)
    throw new GovernanceError(400, 'A step cannot connect to itself');
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    await stepOf(t, ctx, input.fromStepId);
    await stepOf(t, ctx, input.toStepId);
    const [edge] = await tx
      .insert(processEdges)
      .values({
        versionId: ctx.version.id,
        ...input,
        conditionLabel: input.conditionLabel ?? null,
        provenance: 'confirmed',
      })
      .onConflictDoNothing()
      .returning();
    if (!edge) throw new GovernanceError(409, 'These steps are already connected that way');
    await record(t, ctx, userId, 'edge', edge.id, null);
    await touch(t, ctx.version.id);
    return edge;
  });
}

export function deleteEdge(db: Db, ctx: VersionContext, edgeId: string) {
  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(processEdges)
      .where(and(eq(processEdges.id, edgeId), eq(processEdges.versionId, ctx.version.id)))
      .returning();
    if (!deleted.length) throw new GovernanceError(404, 'Connection not found in this version');
    await touch(tx as unknown as Db, ctx.version.id);
  });
}

export function addRule(db: Db, ctx: VersionContext, userId: string, input: RuleInput) {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    if (input.stepId) await stepOf(t, ctx, input.stepId);
    const [rule] = await tx
      .insert(businessRules)
      .values({ versionId: ctx.version.id, ...input, provenance: 'confirmed' })
      .returning();
    await record(t, ctx, userId, 'rule', rule!.id, null);
    await touch(t, ctx.version.id);
    return rule!;
  });
}

export function deleteRule(db: Db, ctx: VersionContext, ruleId: string) {
  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(businessRules)
      .where(and(eq(businessRules.id, ruleId), eq(businessRules.versionId, ctx.version.id)))
      .returning();
    if (!deleted.length) throw new GovernanceError(404, 'Rule not found in this version');
    await touch(tx as unknown as Db, ctx.version.id);
  });
}

/** Owner accepts an AI-inferred (or disputed) element as correct. */
export function acceptElement(
  db: Db,
  ctx: VersionContext,
  userId: string,
  entityType: 'step' | 'edge' | 'rule',
  entityId: string,
) {
  const table =
    entityType === 'step' ? processSteps : entityType === 'edge' ? processEdges : businessRules;
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(table)
      .set({ provenance: 'confirmed' })
      .where(and(eq(table.id, entityId), eq(table.versionId, ctx.version.id)))
      .returning();
    if (!updated.length) throw new GovernanceError(404, 'Item not found in this version');
    await record(tx as unknown as Db, ctx, userId, entityType, entityId, null, 'user_validation');
    await touch(tx as unknown as Db, ctx.version.id);
  });
}

/** Records how an open item (e.g. an SOP contradiction) was resolved. */
export async function resolveOpenItem(
  db: Db,
  ctx: VersionContext,
  itemId: string,
  resolution: string,
) {
  const updated = await db
    .update(openItems)
    .set({ status: 'resolved', resolution })
    .where(and(eq(openItems.id, itemId), eq(openItems.versionId, ctx.version.id)))
    .returning();
  if (!updated.length) throw new GovernanceError(404, 'Item not found for this version');
}
