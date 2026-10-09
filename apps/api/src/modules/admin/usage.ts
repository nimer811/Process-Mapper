import {
  and,
  departments,
  eq,
  gte,
  llmCalls,
  lt,
  processes,
  sql,
  users,
  type Db,
} from '@process-ai/db';
import type { AiUsage } from '@process-ai/shared';
import type { Config } from '../../config.js';

const PURPOSE_LABEL: Record<string, string> = {
  extract: 'Interview: understanding answers',
  analyse_turn: 'Interview: analyst review',
  respond: 'Interview: replies',
  summarise: 'Interview: summaries',
  rolling_summary: 'Interview: memory',
  analyse: 'Analysis and estimates',
  classify: 'Classification and links',
  design: 'To-Be design',
  reconcile: 'Settling differences',
  controls: 'Control suggestions',
  sop: 'SOP drafting',
  embed: 'Knowledge indexing and search',
};

const monthBounds = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return { from: new Date(Date.UTC(y!, m! - 1, 1)), to: new Date(Date.UTC(y!, m!, 1)) };
};
export const currentMonth = () => new Date().toISOString().slice(0, 7);

/** AI usage for one month (YYYY-MM): by department, purpose and person, with estimated cost. */
export async function aiUsage(db: Db, config: Config, month: string): Promise<AiUsage> {
  const { from, to } = monthBounds(month);
  const prices = {
    input: config.LLM_PRICE_INPUT_PER_MTOK,
    output: config.LLM_PRICE_OUTPUT_PER_MTOK,
    embedding: config.LLM_PRICE_EMBEDDING_PER_MTOK,
  };
  const pricesConfigured = prices.input > 0 || prices.output > 0;
  const cost = (purpose: string, input: number, output: number) =>
    purpose === 'embed'
      ? (input * prices.embedding) / 1e6
      : (input * prices.input + output * prices.output) / 1e6;

  const rows = await db
    .select({
      purpose: llmCalls.purpose,
      departmentId: departments.id,
      department: departments.name,
      userId: users.id,
      user: users.displayName,
      status: llmCalls.status,
      calls: sql<number>`count(*)::int`,
      input: sql<number>`coalesce(sum(${llmCalls.inputTokens}), 0)::float`,
      output: sql<number>`coalesce(sum(${llmCalls.outputTokens}), 0)::float`,
      latency: sql<number>`coalesce(sum(${llmCalls.latencyMs}), 0)::float`,
    })
    .from(llmCalls)
    .leftJoin(processes, eq(processes.id, llmCalls.processId))
    .leftJoin(departments, eq(departments.id, processes.departmentId))
    .leftJoin(users, eq(users.id, llmCalls.userId))
    .where(and(gte(llmCalls.createdAt, from), lt(llmCalls.createdAt, to)))
    .groupBy(
      llmCalls.purpose,
      departments.id,
      departments.name,
      users.id,
      users.displayName,
      llmCalls.status,
    );

  const group = (keyOf: (r: (typeof rows)[number]) => [string, string]) => {
    const out = new Map<string, AiUsage['totals']>();
    for (const r of rows) {
      const [key, label] = keyOf(r);
      const g = out.get(key) ?? {
        key,
        label,
        calls: 0,
        failures: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: pricesConfigured ? 0 : null,
      };
      g.calls += r.calls;
      if (r.status === 'error') g.failures += r.calls;
      g.inputTokens += r.input;
      g.outputTokens += r.output;
      if (g.cost !== null) g.cost += cost(r.purpose, r.input, r.output);
      out.set(key, g);
    }
    return [...out.values()]
      .map((g) => ({ ...g, cost: g.cost === null ? null : Math.round(g.cost * 100) / 100 }))
      .sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens));
  };
  const totals = group(() => ['all', 'All AI use'])[0] ?? {
    key: 'all',
    label: 'All AI use',
    calls: 0,
    failures: 0,
    inputTokens: 0,
    outputTokens: 0,
    cost: pricesConfigured ? 0 : null,
  };
  const calls = rows.reduce((n, r) => n + r.calls, 0);

  const trend: AiUsage['trend'] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(from);
    d.setUTCMonth(d.getUTCMonth() - i);
    const m = d.toISOString().slice(0, 7);
    const b = monthBounds(m);
    const [t] = await db
      .select({
        tokens: sql<number>`coalesce(sum(coalesce(${llmCalls.inputTokens}, 0) + coalesce(${llmCalls.outputTokens}, 0)), 0)::float`,
        input: sql<number>`coalesce(sum(case when ${llmCalls.purpose} <> 'embed' then ${llmCalls.inputTokens} end), 0)::float`,
        output: sql<number>`coalesce(sum(${llmCalls.outputTokens}), 0)::float`,
        embed: sql<number>`coalesce(sum(case when ${llmCalls.purpose} = 'embed' then ${llmCalls.inputTokens} end), 0)::float`,
      })
      .from(llmCalls)
      .where(and(gte(llmCalls.createdAt, b.from), lt(llmCalls.createdAt, b.to)));
    trend.push({
      month: m,
      tokens: t?.tokens ?? 0,
      cost: pricesConfigured
        ? Math.round(
            ((t!.input * prices.input + t!.output * prices.output + t!.embed * prices.embedding) /
              1e6) *
              100,
          ) / 100
        : null,
    });
  }

  return {
    month,
    budgetTokens: config.AI_MONTHLY_TOKEN_BUDGET,
    usedTokens: totals.inputTokens + totals.outputTokens,
    pricesConfigured,
    totals,
    byDepartment: group((r) => [
      r.departmentId ?? 'none',
      r.department ?? 'Not linked to a process',
    ]),
    byPurpose: group((r) => [r.purpose, PURPOSE_LABEL[r.purpose] ?? r.purpose]),
    byUser: group((r) => [r.userId ?? 'none', r.user ?? 'Background jobs']).slice(0, 10),
    trend,
    avgLatencyMs: calls ? Math.round(rows.reduce((n, r) => n + r.latency, 0) / calls) : null,
  };
}
