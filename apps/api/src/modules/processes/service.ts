import {
  actors,
  aliasedTable,
  and,
  businessRules,
  count,
  departments,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  processEdges,
  processes,
  processSteps,
  processVersions,
  sql,
  stepDependencies,
  stepSystems,
  systems,
  type Db,
  users,
} from '@process-ai/db';
import type {
  CurrentUser,
  ProcessDetail,
  ProcessListItem,
  ProcessListQuery,
  UserRef,
  VersionGraph,
} from '@process-ai/shared';
import { iso, isoOrNull } from '../../lib/dates.js';
import { canViewVersion, pickDefaultVersion } from './visibility.js';

type UserRow = { id: string; displayName: string; email: string };
const userRef = (u: UserRow | null | undefined): UserRef | null =>
  u ? { id: u.id, displayName: u.displayName, email: u.email } : null;

async function usersById(db: Db, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map<string, UserRow>();
  const rows = await db
    .select({ id: users.id, displayName: users.displayName, email: users.email })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Version ids whose process name, description or step names match the search text. */
async function searchVersionIds(db: Db, q: string) {
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const rows = await db
    .selectDistinct({ id: processVersions.id })
    .from(processVersions)
    .innerJoin(processes, eq(processes.id, processVersions.processId))
    .leftJoin(processSteps, eq(processSteps.versionId, processVersions.id))
    .where(
      or(
        ilike(processes.name, like),
        ilike(processVersions.description, like),
        ilike(processSteps.name, like),
        sql`to_tsvector('english', coalesce(${processes.name}, '') || ' ' || coalesce(${processVersions.description}, '') || ' ' || coalesce(${processSteps.name}, '') || ' ' || coalesce(${processSteps.description}, ''))
            @@ websearch_to_tsquery('english', ${q})`,
      ),
    );
  return new Set(rows.map((r) => r.id));
}

export async function listProcesses(
  db: Db,
  user: CurrentUser,
  query: ProcessListQuery,
): Promise<ProcessListItem[]> {
  const owner = aliasedTable(users, 'owner');
  const procRows = await db
    .select({
      process: processes,
      department: { id: departments.id, name: departments.name, slug: departments.slug },
      owner: { id: owner.id, displayName: owner.displayName, email: owner.email },
    })
    .from(processes)
    .innerJoin(departments, eq(departments.id, processes.departmentId))
    .leftJoin(owner, eq(owner.id, processes.ownerUserId))
    .where(
      and(
        isNull(processes.archivedAt),
        query.department ? eq(departments.slug, query.department) : undefined,
      ),
    )
    .orderBy(processes.name);
  if (procRows.length === 0) return [];

  const versions = await db
    .select()
    .from(processVersions)
    .where(
      inArray(
        processVersions.processId,
        procRows.map((r) => r.process.id),
      ),
    );
  const stepCounts = await db
    .select({ versionId: processSteps.versionId, n: count() })
    .from(processSteps)
    .where(
      inArray(
        processSteps.versionId,
        versions.map((v) => v.id),
      ),
    )
    .groupBy(processSteps.versionId);
  const stepCountByVersion = new Map(stepCounts.map((r) => [r.versionId, r.n]));
  const matches = query.q ? await searchVersionIds(db, query.q) : null;

  const items: ProcessListItem[] = [];
  for (const { process: p, department, owner: o } of procRows) {
    const ctx = { ownerUserId: p.ownerUserId, processCreatedBy: p.createdBy };
    const v = pickDefaultVersion(
      user,
      versions.filter((x) => x.processId === p.id),
      p.currentVersionId,
      ctx,
    );
    if (!v) continue;
    if (query.status && v.status !== query.status) continue;
    if (matches && !matches.has(v.id)) continue;
    items.push({
      id: p.id,
      name: p.name,
      slug: p.slug,
      department,
      owner: userRef(o),
      versionId: v.id,
      versionNumber: v.versionNumber,
      status: v.status,
      description: v.description,
      stepCount: stepCountByVersion.get(v.id) ?? 0,
      lastReviewedAt: isoOrNull(v.approvedAt ?? v.validatedAt),
      updatedAt: iso(v.updatedAt),
    });
  }
  return items;
}

export async function getProcess(
  db: Db,
  user: CurrentUser,
  processId: string,
): Promise<ProcessDetail | null> {
  const [row] = await db
    .select({
      process: processes,
      department: { id: departments.id, name: departments.name, slug: departments.slug },
    })
    .from(processes)
    .innerJoin(departments, eq(departments.id, processes.departmentId))
    .where(eq(processes.id, processId));
  if (!row) return null;
  const p = row.process;
  const ctx = { ownerUserId: p.ownerUserId, processCreatedBy: p.createdBy };

  const versions = (
    await db
      .select()
      .from(processVersions)
      .where(eq(processVersions.processId, p.id))
      .orderBy(desc(processVersions.versionNumber))
  ).filter((v) => canViewVersion(user, v, ctx));

  const defaultVersion = pickDefaultVersion(user, versions, p.currentVersionId, ctx);
  if (!defaultVersion) return null;

  const people = await usersById(db, [
    p.ownerUserId,
    ...versions.flatMap((v) => [v.createdBy, v.validatedBy, v.approvedBy]),
  ]);
  const ref = (id: string | null) => userRef(id ? people.get(id) : null);

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    department: row.department,
    owner: ref(p.ownerUserId),
    defaultVersionId: defaultVersion.id,
    versions: versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      kind: v.kind,
      status: v.status,
      changeSummary: v.changeSummary,
      createdBy: ref(v.createdBy),
      createdAt: iso(v.createdAt),
      validatedBy: ref(v.validatedBy),
      validatedAt: isoOrNull(v.validatedAt),
      approvedBy: ref(v.approvedBy),
      approvedAt: isoOrNull(v.approvedAt),
    })),
  };
}

export async function getVersionGraph(
  db: Db,
  user: CurrentUser,
  versionId: string,
): Promise<VersionGraph | null> {
  const [row] = await db
    .select({ version: processVersions, process: processes })
    .from(processVersions)
    .innerJoin(processes, eq(processes.id, processVersions.processId))
    .where(eq(processVersions.id, versionId));
  if (!row) return null;
  const { version: v, process: p } = row;
  if (!canViewVersion(user, v, { ownerUserId: p.ownerUserId, processCreatedBy: p.createdBy })) {
    return null;
  }

  const [steps, systemRows, depRows, edges, rules] = await Promise.all([
    db
      .select({ step: processSteps, actor: { id: actors.id, name: actors.name } })
      .from(processSteps)
      .leftJoin(actors, eq(actors.id, processSteps.actorId))
      .where(eq(processSteps.versionId, v.id))
      .orderBy(processSteps.sequence),
    db
      .select({ stepId: stepSystems.stepId, id: systems.id, name: systems.name })
      .from(stepSystems)
      .innerJoin(systems, eq(systems.id, stepSystems.systemId))
      .innerJoin(processSteps, eq(processSteps.id, stepSystems.stepId))
      .where(eq(processSteps.versionId, v.id))
      .orderBy(systems.name),
    db
      .select({ stepId: stepDependencies.stepId, dependsOn: stepDependencies.dependsOnStepId })
      .from(stepDependencies)
      .innerJoin(processSteps, eq(processSteps.id, stepDependencies.stepId))
      .where(eq(processSteps.versionId, v.id)),
    db.select().from(processEdges).where(eq(processEdges.versionId, v.id)),
    db.select().from(businessRules).where(eq(businessRules.versionId, v.id)),
  ]);

  return {
    id: v.id,
    processId: v.processId,
    versionNumber: v.versionNumber,
    kind: v.kind,
    status: v.status,
    description: v.description,
    purpose: v.purpose,
    trigger: v.trigger,
    endCondition: v.endCondition,
    frequency: v.frequency,
    volume: v.volume,
    scopeNotes: v.scopeNotes,
    completenessScore: v.completenessScore,
    createdAt: iso(v.createdAt),
    updatedAt: iso(v.updatedAt),
    validatedAt: isoOrNull(v.validatedAt),
    approvedAt: isoOrNull(v.approvedAt),
    steps: steps.map(({ step: s, actor }) => ({
      id: s.id,
      stepKey: s.stepKey,
      sequence: s.sequence,
      type: s.type,
      name: s.name,
      description: s.description,
      actor: actor?.id ? actor : null,
      systems: systemRows.filter((r) => r.stepId === s.id).map(({ id, name }) => ({ id, name })),
      inputs: s.inputs,
      outputs: s.outputs,
      execution: s.execution,
      expectedDuration: s.expectedDuration,
      sla: s.sla,
      approvalAuthority: s.approvalAuthority,
      painPoints: s.painPoints,
      dependsOn: depRows.filter((d) => d.stepId === s.id).map((d) => d.dependsOn),
      provenance: s.provenance,
      confidence: s.confidence,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      fromStepId: e.fromStepId,
      toStepId: e.toStepId,
      type: e.type,
      conditionLabel: e.conditionLabel,
      provenance: e.provenance,
    })),
    rules: rules.map((r) => ({
      id: r.id,
      stepId: r.stepId,
      ruleType: r.ruleType,
      statement: r.statement,
      provenance: r.provenance,
    })),
  };
}
