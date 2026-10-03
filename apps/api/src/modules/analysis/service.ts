import {
  aiAnalysis,
  analyzeProcess,
  graphOutline,
  type Findings as FindingSet,
  type LlmGateway,
} from '@process-ai/agent';
import {
  and,
  automationOpportunities,
  eq,
  inArray,
  issues,
  llmCalls,
  users,
  type Db,
} from '@process-ai/db';
import type { CurrentUser, Issue, Opportunity, VersionGraph } from '@process-ai/shared';
import { getProcess } from '../processes/service.js';

type IssueRow = typeof issues.$inferSelect;
type OpportunityRow = typeof automationOpportunities.$inferSelect;

async function decidersById(db: Db, rows: { decidedBy: string | null }[]) {
  const ids = [...new Set(rows.map((r) => r.decidedBy).filter((x): x is string => !!x))];
  if (!ids.length) return new Map<string, { id: string; displayName: string; email: string }>();
  const people = await db
    .select({ id: users.id, displayName: users.displayName, email: users.email })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(people.map((p) => [p.id, p]));
}

const base = (r: IssueRow | OpportunityRow, people: Awaited<ReturnType<typeof decidersById>>) => ({
  id: r.id,
  stepId: r.stepId,
  title: r.title,
  description: r.description,
  source: r.source,
  status: r.status,
  decidedBy: r.decidedBy ? (people.get(r.decidedBy) ?? null) : null,
  decidedAt: r.decidedAt?.toISOString() ?? null,
  decisionNote: r.decisionNote,
  createdAt: r.createdAt.toISOString(),
});

const SEVERITY = { high: 0, medium: 1, low: 2 } as const;
const STATUS = { accepted: 0, proposed: 1, dismissed: 2 } as const;

export async function listFindings(
  db: Db,
  versionId: string,
): Promise<{ issues: Issue[]; opportunities: Opportunity[] }> {
  const [iss, opps] = await Promise.all([
    db.select().from(issues).where(eq(issues.versionId, versionId)),
    db
      .select()
      .from(automationOpportunities)
      .where(eq(automationOpportunities.versionId, versionId)),
  ]);
  const people = await decidersById(db, [...iss, ...opps]);
  return {
    issues: iss
      .map((r) => ({ ...base(r, people), category: r.category, severity: r.severity }))
      .sort(
        (a, b) =>
          STATUS[a.status] - STATUS[b.status] || SEVERITY[a.severity] - SEVERITY[b.severity],
      ),
    // Quick wins first: high impact, low effort.
    opportunities: opps
      .map((r) => ({
        ...base(r, people),
        kind: r.kind,
        expectedBenefit: r.expectedBenefit,
        impact: r.impact,
        effort: r.effort,
      }))
      .sort(
        (a, b) =>
          STATUS[a.status] - STATUS[b.status] ||
          SEVERITY[a.impact] - SEVERITY[b.impact] ||
          SEVERITY[b.effort] - SEVERITY[a.effort],
      ),
  };
}

/**
 * Stores rule-check findings idempotently: new keys are inserted, unchanged proposals refreshed,
 * proposals whose problem disappeared are removed, and accepted/dismissed decisions are never touched.
 */
async function storeRuleFindings(db: Db, versionId: string, found: FindingSet) {
  await db.transaction(async (tx) => {
    const existingIssues = await tx
      .select()
      .from(issues)
      .where(and(eq(issues.versionId, versionId), inArray(issues.source, ['heuristic', 'user'])));
    const issueKeys = new Set(found.issues.map((i) => i.key));
    for (const f of found.issues) {
      const prev = existingIssues.find((e) => e.findingKey === f.key);
      const values = {
        stepId: f.stepId,
        category: f.category,
        severity: f.severity,
        title: f.title,
        description: f.description,
      };
      if (!prev)
        await tx
          .insert(issues)
          .values({ versionId, findingKey: f.key, source: f.source, ...values });
      else if (prev.status === 'proposed')
        await tx.update(issues).set(values).where(eq(issues.id, prev.id));
    }
    const staleIssues = existingIssues
      .filter((e) => e.status === 'proposed' && e.findingKey && !issueKeys.has(e.findingKey))
      .map((e) => e.id);
    if (staleIssues.length) await tx.delete(issues).where(inArray(issues.id, staleIssues));

    const existingOpps = await tx
      .select()
      .from(automationOpportunities)
      .where(
        and(
          eq(automationOpportunities.versionId, versionId),
          eq(automationOpportunities.source, 'heuristic'),
        ),
      );
    const oppKeys = new Set(found.opportunities.map((o) => o.key));
    for (const f of found.opportunities) {
      const prev = existingOpps.find((e) => e.findingKey === f.key);
      const values = {
        stepId: f.stepId,
        kind: f.kind,
        title: f.title,
        description: f.description,
        expectedBenefit: f.expectedBenefit,
        impact: f.impact,
        effort: f.effort,
      };
      if (!prev)
        await tx
          .insert(automationOpportunities)
          .values({ versionId, findingKey: f.key, source: 'heuristic', ...values });
      else if (prev.status === 'proposed')
        await tx
          .update(automationOpportunities)
          .set(values)
          .where(eq(automationOpportunities.id, prev.id));
    }
    const staleOpps = existingOpps
      .filter((e) => e.status === 'proposed' && e.findingKey && !oppKeys.has(e.findingKey))
      .map((e) => e.id);
    if (staleOpps.length)
      await tx
        .delete(automationOpportunities)
        .where(inArray(automationOpportunities.id, staleOpps));
  });
}

/** Replaces earlier *proposed* AI suggestions with a fresh set; decided ones stay. */
async function storeAiFindings(db: Db, versionId: string, userId: string, raw: FindingSet) {
  // Skip AI items that repeat a non-AI finding on the same step with the same type.
  const [known, knownOpps] = await Promise.all([
    db
      .select({ stepId: issues.stepId, category: issues.category, source: issues.source })
      .from(issues)
      .where(eq(issues.versionId, versionId)),
    db
      .select({
        stepId: automationOpportunities.stepId,
        kind: automationOpportunities.kind,
        source: automationOpportunities.source,
      })
      .from(automationOpportunities)
      .where(eq(automationOpportunities.versionId, versionId)),
  ]);
  const found: FindingSet = {
    issues: raw.issues.filter(
      (f) =>
        !f.stepId ||
        !known.some((k) => k.source !== 'ai' && k.stepId === f.stepId && k.category === f.category),
    ),
    opportunities: raw.opportunities.filter(
      (f) =>
        !f.stepId ||
        !knownOpps.some((k) => k.source !== 'ai' && k.stepId === f.stepId && k.kind === f.kind),
    ),
  };
  await db.transaction(async (tx) => {
    await tx
      .delete(issues)
      .where(
        and(
          eq(issues.versionId, versionId),
          eq(issues.source, 'ai'),
          eq(issues.status, 'proposed'),
        ),
      );
    await tx
      .delete(automationOpportunities)
      .where(
        and(
          eq(automationOpportunities.versionId, versionId),
          eq(automationOpportunities.source, 'ai'),
          eq(automationOpportunities.status, 'proposed'),
        ),
      );
    if (found.issues.length) {
      await tx.insert(issues).values(
        found.issues.map((f) => ({
          versionId,
          stepId: f.stepId,
          category: f.category,
          severity: f.severity,
          title: f.title,
          description: f.description,
          source: 'ai' as const,
          createdBy: userId,
        })),
      );
    }
    if (found.opportunities.length) {
      await tx.insert(automationOpportunities).values(
        found.opportunities.map((f) => ({
          versionId,
          stepId: f.stepId,
          kind: f.kind,
          title: f.title,
          description: f.description,
          expectedBenefit: f.expectedBenefit,
          impact: f.impact,
          effort: f.effort,
          source: 'ai' as const,
          createdBy: userId,
        })),
      );
    }
  });
}

export async function runRuleChecks(db: Db, graph: VersionGraph) {
  await storeRuleFindings(db, graph.id, analyzeProcess(graph));
}

/** Rule checks always; AI analysis when asked for and configured. Returns an AI error message instead of failing. */
export async function runAnalysis(
  db: Db,
  llm: LlmGateway | null,
  user: CurrentUser,
  graph: VersionGraph,
  withAi: boolean,
) {
  await runRuleChecks(db, graph);
  if (!withAi || !llm)
    return { aiError: withAi && !llm ? 'The AI model is not configured.' : null };

  const current = await listFindings(db, graph.id);
  const process = await getProcess(db, user, graph.processId);
  try {
    const found = await aiAnalysis(
      llm,
      {
        name: process?.name ?? 'Process',
        outline: graphOutline(graph),
        existing: [...current.issues, ...current.opportunities].map(
          (f) => `${f.title}${f.status === 'dismissed' ? ' (dismissed)' : ''}`,
        ),
        graph,
      },
      (r) =>
        void db
          .insert(llmCalls)
          .values({ ...r })
          .catch(() => {}),
    );
    await storeAiFindings(db, graph.id, user.id, found);
    return { aiError: null };
  } catch {
    return {
      aiError: 'The AI analysis failed. The rule checks were still updated; try again later.',
    };
  }
}
