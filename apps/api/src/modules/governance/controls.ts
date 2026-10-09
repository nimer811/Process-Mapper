import {
  and,
  businessRules,
  controls,
  desc,
  eq,
  evidence,
  inArray,
  processes,
  processSteps,
  processVersions,
  sql,
  type Db,
} from '@process-ai/db';
import type { Control, ControlInput } from '@process-ai/shared';
import { GovernanceError, type VersionContext } from './service.js';

const DEPT_CODES: Record<string, string> = {
  procurement: 'PRC',
  finance: 'FIN',
  warehouse: 'WHS',
  warehousing: 'WHS',
  transport: 'TRN',
  logistics: 'LOG',
  customs: 'CUS',
  hse: 'HSE',
  'human-resources': 'HRM',
  hr: 'HRM',
  it: 'ITS',
};

/** Short department code used in document and control IDs, e.g. procurement → PRC. */
export function deptCode(slug: string) {
  return (
    DEPT_CODES[slug] ??
    slug
      .replace(/[^a-z]/gi, '')
      .slice(0, 3)
      .toUpperCase()
      .padEnd(3, 'X')
  );
}

export const toControl = (c: typeof controls.$inferSelect): Control => ({
  id: c.id,
  controlKey: c.controlKey,
  name: c.name,
  description: c.description,
  controlType: c.controlType,
  mode: c.mode,
  frequency: c.frequency,
  ownerRole: c.ownerRole,
  evidence: c.evidence,
  isKey: c.isKey,
  risk: c.risk,
  ruleId: c.ruleId,
  stepIds: c.stepIds,
  provenance: c.provenance,
});

export async function listControls(db: Db, versionId: string): Promise<Control[]> {
  const rows = await db
    .select()
    .from(controls)
    .where(eq(controls.versionId, versionId))
    .orderBy(controls.controlKey);
  return rows.map(toControl);
}

/** Next free key in the department, e.g. PRC-C-007 (keys are never reused). */
export async function nextControlKeys(db: Db, departmentId: string, slug: string, n: number) {
  const code = deptCode(slug);
  const [row] = await db
    .select({
      max: sql<number>`coalesce(max(substring(${controls.controlKey} from '[0-9]+$')::int), 0)`,
    })
    .from(controls)
    .innerJoin(processVersions, eq(processVersions.id, controls.versionId))
    .innerJoin(processes, eq(processes.id, processVersions.processId))
    .where(
      and(
        eq(processes.departmentId, departmentId),
        sql`${controls.controlKey} like ${`${code}-C-%`}`,
      ),
    );
  const start = Number(row?.max ?? 0);
  return Array.from({ length: n }, (_, i) => `${code}-C-${String(start + i + 1).padStart(3, '0')}`);
}

/** Steps and rule referenced by a control must belong to this version. */
async function checkRefs(db: Db, versionId: string, input: Partial<ControlInput>) {
  if (input.stepIds?.length) {
    const found = await db
      .select({ id: processSteps.id })
      .from(processSteps)
      .where(and(eq(processSteps.versionId, versionId), inArray(processSteps.id, input.stepIds)));
    if (found.length !== new Set(input.stepIds).size)
      throw new GovernanceError(400, 'A linked step is not in this version');
  }
  if (input.ruleId) {
    const rule = await db.query.businessRules.findFirst({
      where: and(eq(businessRules.id, input.ruleId), eq(businessRules.versionId, versionId)),
    });
    if (!rule) throw new GovernanceError(400, 'The linked rule is not in this version');
  }
}

const recordEvidence = (
  db: Db,
  versionId: string,
  userId: string | null,
  id: string,
  source: 'manual_edit' | 'user_validation' | 'ai_inference',
  field: string | null = null,
) =>
  db.insert(evidence).values({
    versionId,
    entityType: 'control',
    entityId: id,
    field,
    sourceType: source,
    providedBy: source === 'ai_inference' ? null : userId,
  });

export async function addControls(
  db: Db,
  ctx: VersionContext,
  userId: string | null,
  inputs: ControlInput[],
  provenance: 'confirmed' | 'inferred' = 'confirmed',
) {
  for (const input of inputs) await checkRefs(db, ctx.version.id, input);
  const dept = await db.query.departments.findFirst({
    where: (d, { eq: e }) => e(d.id, ctx.process.departmentId),
  });
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    // Serialise key allocation within the department.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`controls:${ctx.process.departmentId}`}))`,
    );
    const keys = await nextControlKeys(t, ctx.process.departmentId, dept!.slug, inputs.length);
    const created: Control[] = [];
    for (const [i, input] of inputs.entries()) {
      const [row] = await tx
        .insert(controls)
        .values({
          versionId: ctx.version.id,
          controlKey: keys[i]!,
          name: input.name,
          description: input.description ?? null,
          controlType: input.controlType,
          mode: input.mode,
          frequency: input.frequency ?? null,
          ownerRole: input.ownerRole ?? null,
          evidence: input.evidence ?? null,
          isKey: input.isKey ?? false,
          risk: input.risk ?? null,
          ruleId: input.ruleId ?? null,
          stepIds: input.stepIds ?? [],
          provenance,
        })
        .returning();
      await recordEvidence(
        t,
        ctx.version.id,
        userId,
        row!.id,
        provenance === 'inferred' ? 'ai_inference' : 'manual_edit',
      );
      created.push(toControl(row!));
    }
    return created;
  });
}

async function controlOf(db: Db, ctx: VersionContext, id: string) {
  const c = await db.query.controls.findFirst({
    where: and(eq(controls.id, id), eq(controls.versionId, ctx.version.id)),
  });
  if (!c) throw new GovernanceError(404, 'Control not found in this version');
  return c;
}

/** An owner's edit confirms the control. */
export async function updateControl(
  db: Db,
  ctx: VersionContext,
  userId: string,
  id: string,
  input: Partial<ControlInput>,
) {
  await controlOf(db, ctx, id);
  await checkRefs(db, ctx.version.id, input);
  await db
    .update(controls)
    .set({ ...input, provenance: 'confirmed' })
    .where(eq(controls.id, id));
  await recordEvidence(db, ctx.version.id, userId, id, 'manual_edit', Object.keys(input).join(','));
}

export async function confirmControl(db: Db, ctx: VersionContext, userId: string, id: string) {
  await controlOf(db, ctx, id);
  await db.update(controls).set({ provenance: 'confirmed' }).where(eq(controls.id, id));
  await recordEvidence(db, ctx.version.id, userId, id, 'user_validation');
}

export async function deleteControl(db: Db, ctx: VersionContext, id: string) {
  await controlOf(db, ctx, id);
  await db.delete(controls).where(eq(controls.id, id));
}

/** Latest controls first, for de-duplicating AI suggestions. */
export const controlNames = async (db: Db, versionId: string) =>
  (
    await db
      .select({ name: controls.name, description: controls.description })
      .from(controls)
      .where(eq(controls.versionId, versionId))
      .orderBy(desc(controls.createdAt))
  ).map((c) => `${c.name} ${c.description ?? ''}`);
