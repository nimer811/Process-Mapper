import {
  aliasedTable,
  and,
  asc,
  eq,
  inArray,
  or,
  processCategories,
  processes,
  processLinks,
  sopDocuments,
  processVersions,
  type Db,
} from '@process-ai/db';
import type {
  CategoryRef,
  Coverage,
  CurrentUser,
  EndToEndFlow,
  ProcessCategory,
  ProcessLink,
} from '@process-ai/shared';
import { getVersionGraph, listProcesses } from '../processes/service.js';

/** Most processes reachable from one in the end-to-end view. */
const MAX_FLOW = 15;

export const toCategory = (c: typeof processCategories.$inferSelect): ProcessCategory => ({
  id: c.id,
  code: c.code,
  name: c.name,
  level: c.level,
  parentId: c.parentId,
  departmentId: c.departmentId,
  description: c.description,
  source: c.source,
});

/** Sorts codes like 4.2.10 after 4.2.9. */
const byCode = (a: { code: string }, b: { code: string }) =>
  a.code.localeCompare(b.code, undefined, { numeric: true });

export async function listCategories(db: Db) {
  return (await db.select().from(processCategories).orderBy(asc(processCategories.code)))
    .map(toCategory)
    .sort(byCode);
}

/** "4.0 Manage supply chain › 4.2 Procure…" for a node, for prompts and display. */
export function categoryPath(all: ProcessCategory[], id: string) {
  const byId = new Map(all.map((c) => [c.id, c]));
  const parts: string[] = [];
  for (let c = byId.get(id); c; c = c.parentId ? byId.get(c.parentId) : undefined)
    parts.unshift(`${c.code} ${c.name}`);
  return parts.join(' › ');
}

const from = aliasedTable(processes, 'from_process');
const to = aliasedTable(processes, 'to_process');

/** Links touching these processes, both ways. */
export async function linksFor(db: Db, processIds: string[]): Promise<ProcessLink[]> {
  if (!processIds.length) return [];
  const rows = await db
    .select({
      link: processLinks,
      from: { id: from.id, name: from.name },
      to: { id: to.id, name: to.name },
    })
    .from(processLinks)
    .innerJoin(from, eq(from.id, processLinks.fromProcessId))
    .innerJoin(to, eq(to.id, processLinks.toProcessId))
    .where(
      or(
        inArray(processLinks.fromProcessId, processIds),
        inArray(processLinks.toProcessId, processIds),
      ),
    );
  return rows.map(({ link: l, from: f, to: t }) => ({
    id: l.id,
    from: f,
    to: t,
    fromStepKey: l.fromStepKey,
    label: l.label,
    provenance: l.provenance === 'inferred' ? 'inferred' : 'confirmed',
    reasoning: l.reasoning,
  }));
}

/** The connected chain around one process (only processes the viewer can see). */
export async function endToEnd(
  db: Db,
  user: CurrentUser,
  processId: string,
): Promise<EndToEndFlow> {
  const visible = new Map((await listProcesses(db, user, {})).map((p) => [p.id, p]));
  if (!visible.has(processId)) return { processes: [], links: [] };
  const seen = new Set([processId]);
  const links = new Map<string, ProcessLink>();
  let frontier = [processId];
  while (frontier.length && seen.size < MAX_FLOW) {
    const found = await linksFor(db, frontier);
    frontier = [];
    for (const l of found) {
      if (!visible.has(l.from.id) || !visible.has(l.to.id)) continue;
      links.set(l.id, l);
      for (const id of [l.from.id, l.to.id])
        if (!seen.has(id) && seen.size < MAX_FLOW) {
          seen.add(id);
          frontier.push(id);
        }
    }
  }
  const items = [];
  for (const id of seen) {
    const p = visible.get(id)!;
    const g = await getVersionGraph(db, user, p.versionId);
    items.push({
      id: p.id,
      name: p.name,
      department: p.department.name,
      status: p.status,
      stepCount: p.stepCount,
      trigger: g?.trigger ?? null,
      endCondition: g?.endCondition ?? null,
      category: p.category,
    });
  }
  return {
    processes: items,
    links: [...links.values()].filter((l) => seen.has(l.from.id) && seen.has(l.to.id)),
  };
}

const addMonths = (d: Date, n: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
};

/**
 * A department's coverage: the classification nodes it is expected to cover (by department scope),
 * the processes mapped under each, and how far they have got (validated, approved, SOP, review due).
 */
export async function coverage(
  db: Db,
  user: CurrentUser,
  departmentSlug: string,
): Promise<Coverage> {
  const items = await listProcesses(db, user, { department: departmentSlug });
  const all = await listCategories(db);
  const dept = items[0]?.department.id ?? null;
  const deptRow = dept
    ? null
    : await db.query.departments.findFirst({ where: (d, { eq: e }) => e(d.slug, departmentSlug) });
  const departmentId = dept ?? deptRow?.id ?? null;

  const ids = items.map((p) => p.id);
  const extra = ids.length
    ? await db
        .select({ id: processes.id, reviewCycleMonths: processes.reviewCycleMonths })
        .from(processes)
        .where(inArray(processes.id, ids))
    : [];
  const published = ids.length
    ? await db
        .select({ processId: processVersions.processId })
        .from(sopDocuments)
        .innerJoin(processVersions, eq(processVersions.id, sopDocuments.versionId))
        .where(and(inArray(processVersions.processId, ids), eq(sopDocuments.status, 'published')))
    : [];
  const cycle = new Map(extra.map((e) => [e.id, e.reviewCycleMonths]));
  const sop = new Set(published.map((p) => p.processId));
  const now = new Date();
  const status = (p: (typeof items)[number]) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    sopPublished: sop.has(p.id),
    reviewOverdue:
      (p.status === 'approved' || p.status === 'validated') &&
      !!p.lastReviewedAt &&
      addMonths(new Date(p.lastReviewedAt), cycle.get(p.id) ?? 12) < now,
    lastReviewedAt: p.lastReviewedAt,
  });

  // Nodes in the department's scope: those assigned to it, and everything under them.
  const children = new Map<string | null, ProcessCategory[]>();
  for (const c of all) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c]);
  const inScope = new Set<string>();
  const addTree = (c: ProcessCategory) => {
    inScope.add(c.id);
    for (const k of children.get(c.id) ?? []) addTree(k);
  };
  for (const c of all) if (departmentId && c.departmentId === departmentId) addTree(c);
  // Groups: in-scope nodes whose parent is not in scope (the top of the department's branch).
  const ref = (c: ProcessCategory): CategoryRef => ({ id: c.id, code: c.code, name: c.name });
  const groups = all.filter((c) => inScope.has(c.id) && !(c.parentId && inScope.has(c.parentId)));
  const leavesOf = (c: ProcessCategory): ProcessCategory[] => {
    const k = (children.get(c.id) ?? []).filter((x) => inScope.has(x.id));
    return k.length ? k.flatMap(leavesOf) : [c];
  };
  const descendants = (c: ProcessCategory): Set<string> => {
    const out = new Set([c.id]);
    for (const k of children.get(c.id) ?? []) for (const id of descendants(k)) out.add(id);
    return out;
  };

  const placed = new Set<string>();
  const areas = groups.sort(byCode).map((group) => ({
    group: ref(group),
    items: leavesOf(group)
      .sort(byCode)
      .map((leaf) => {
        const under = descendants(leaf);
        const ps = items.filter((p) => p.category && under.has(p.category.id));
        ps.forEach((p) => placed.add(p.id));
        return { category: ref(leaf), processes: ps.map(status) };
      }),
  }));
  // Processes attached to a group node itself (not a leaf) still count as placed.
  for (const p of items) if (p.category && inScope.has(p.category.id)) placed.add(p.id);
  const leaves = areas.flatMap((a) => a.items);
  const mapped = items.filter((p) => placed.has(p.id)).map(status);
  return {
    totals: {
      expected: leaves.length,
      mapped: leaves.filter((l) => l.processes.length).length,
      validated: mapped.filter((p) => p.status === 'validated' || p.status === 'approved').length,
      approved: mapped.filter((p) => p.status === 'approved').length,
      sopPublished: mapped.filter((p) => p.sopPublished).length,
      reviewOverdue: mapped.filter((p) => p.reviewOverdue).length,
    },
    areas,
    unclassified: items.filter((p) => !placed.has(p.id)).map(status),
  };
}
