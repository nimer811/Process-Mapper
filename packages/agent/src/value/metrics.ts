import type { FigureSource, OpportunityKind, ValueView, VersionGraph } from '@process-ai/shared';
import { formatMinutes, parseDurationMinutes, parseVolumePerMonth } from './parse.js';

type Step = VersionGraph['steps'][number];

export interface Estimate {
  stepId: string | null;
  source: 'owner' | 'ai';
  effortMinutes: number | null;
  durationMinutes: number | null;
  volumePerMonth: number | null;
}

export interface OpportunityInput {
  id: string;
  title: string;
  kind: OpportunityKind;
  status: string;
  stepId: string | null;
}

/** Share of a step's hands-on effort an opportunity of this kind typically removes (planning figures). */
export const SAVING_FACTOR: Record<OpportunityKind, number> = {
  elimination: 1,
  rpa: 0.8,
  integration: 0.7,
  ai: 0.5,
  self_service: 0.5,
  workflow: 0.4,
  other: 0.3,
};

const isWork = (s: Step) => s.type !== 'start' && s.type !== 'end';
const NORMAL_FLOW = new Set(['sequence', 'branch', 'alternate']);
const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Timings and value for a version: cycle time along the longest normal path (no exceptions or
 * loops), hands-on time, waiting share, effort per month, and hours each opportunity could save.
 * Figures come from the owner, then the map's own words, then AI estimates.
 */
export function computeValue(input: {
  graph: VersionGraph;
  opportunities: OpportunityInput[];
  estimates: Estimate[];
  canEdit?: boolean;
  canEstimate: boolean;
}): ValueView {
  const { graph: g } = input;
  const est = (stepId: string | null, source: 'owner' | 'ai') =>
    input.estimates.find((e) => e.stepId === stepId && e.source === source);
  const fig = (value: number | null | undefined, source: FigureSource) =>
    value === null || value === undefined ? null : { value, source };

  const duration = (s: Step) =>
    fig(est(s.id, 'owner')?.durationMinutes, 'owner') ??
    fig(parseDurationMinutes(s.expectedDuration), 'stated') ??
    fig(s.execution === 'automated' ? 0 : null, 'stated') ??
    fig(est(s.id, 'ai')?.durationMinutes, 'ai') ?? { value: null, source: null };
  const effort = (s: Step) =>
    fig(est(s.id, 'owner')?.effortMinutes, 'owner') ??
    fig(s.execution === 'automated' ? 0 : null, 'stated') ??
    fig(est(s.id, 'ai')?.effortMinutes, 'ai') ?? { value: null, source: null };
  const volume = fig(est(null, 'owner')?.volumePerMonth, 'owner') ??
    fig(parseVolumePerMonth(g.volume, g.frequency), 'stated') ??
    fig(est(null, 'ai')?.volumePerMonth, 'ai') ?? { value: null, source: null };

  // Longest normal path (by duration) from a start to an end; cycles are cut.
  const next = new Map<string, string[]>();
  for (const e of g.edges)
    if (NORMAL_FLOW.has(e.type))
      next.set(e.fromStepId, [...(next.get(e.fromStepId) ?? []), e.toStepId]);
  const byId = new Map(g.steps.map((s) => [s.id, s]));
  const memo = new Map<string, { total: number; path: string[] }>();
  const longest = (id: string, stack: Set<string>): { total: number; path: string[] } => {
    if (memo.has(id)) return memo.get(id)!;
    if (stack.has(id)) return { total: 0, path: [] };
    stack.add(id);
    const s = byId.get(id)!;
    const own = isWork(s) ? (duration(s).value ?? 0) : 0;
    let best = { total: 0, path: [] as string[] };
    for (const n of next.get(id) ?? []) {
      const r = longest(n, stack);
      if (r.total > best.total || (r.total === best.total && r.path.length > best.path.length))
        best = r;
    }
    stack.delete(id);
    const out = { total: own + best.total, path: [id, ...best.path] };
    memo.set(id, out);
    return out;
  };
  const incoming = new Set(g.edges.filter((e) => NORMAL_FLOW.has(e.type)).map((e) => e.toStepId));
  const starts = g.steps.filter((s) => s.type === 'start');
  const roots = starts.length ? starts : g.steps.filter((s) => !incoming.has(s.id));
  const main = roots
    .map((s) => longest(s.id, new Set()))
    .sort((a, b) => b.total - a.total || b.path.length - a.path.length)[0];
  const onMain = new Set(main?.path ?? []);

  const work = g.steps.filter(isWork);
  const steps = work.map((s) => ({
    stepId: s.id,
    stepKey: s.stepKey,
    name: s.name,
    actor: s.actor?.name ?? null,
    onMainPath: onMain.has(s.id),
    duration: duration(s),
    effort: effort(s),
  }));
  const path = steps.filter((s) => s.onMainPath);
  const known = (xs: { value: number | null }[]) => xs.filter((x) => x.value !== null).length;
  const cycle =
    path.length && known(path.map((s) => s.duration))
      ? path.reduce((a, s) => a + (s.duration.value ?? 0), 0)
      : null;
  const touch =
    path.length && known(path.map((s) => s.effort))
      ? path.reduce((a, s) => a + (s.effort.value ?? 0), 0)
      : null;
  const effortById = new Map(steps.map((s) => [s.stepId, s.effort.value]));
  const keyById = new Map(g.steps.map((s) => [s.id, s.stepKey]));

  const opportunities = input.opportunities
    .map((o) => {
      const factor = SAVING_FACTOR[o.kind];
      const e = o.stepId ? (effortById.get(o.stepId) ?? null) : null;
      const hours =
        e !== null && volume.value !== null ? round1((e * volume.value * factor) / 60) : null;
      const assumption = !o.stepId
        ? 'Not linked to a step, so the saving cannot be estimated.'
        : e === null
          ? 'Hands-on time for the step is unknown.'
          : volume.value === null
            ? 'Volume per month is unknown.'
            : `${Math.round(factor * 100)}% of ${formatMinutes(e)} hands-on × ${volume.value} cases a month.`;
      return {
        id: o.id,
        title: o.title,
        kind: o.kind,
        status: o.status,
        stepKey: o.stepId ? (keyById.get(o.stepId) ?? null) : null,
        hoursSavedPerMonth: hours,
        assumption,
      };
    })
    .sort((a, b) => (b.hoursSavedPerMonth ?? -1) - (a.hoursSavedPerMonth ?? -1));

  return {
    volumePerMonth: volume,
    cycleMinutes: cycle,
    touchMinutes: touch,
    waitShare:
      cycle && touch !== null ? Math.round(Math.max(0, (cycle - touch) / cycle) * 100) / 100 : null,
    effortHoursPerMonth:
      touch !== null && volume.value !== null ? round1((touch * volume.value) / 60) : null,
    completeness: {
      duration: work.length ? known(steps.map((s) => s.duration)) / work.length : 0,
      effort: work.length ? known(steps.map((s) => s.effort)) / work.length : 0,
    },
    steps,
    opportunities,
    canEdit: input.canEdit ?? input.canEstimate,
    canEstimate: input.canEstimate,
    assumptions: [
      'Working time: a day is 8 hours, a week 5 days.',
      'Cycle time follows the longest normal path from start to end (exceptions and loop-backs excluded).',
      'Savings use planning factors by opportunity type (e.g. RPA removes 80% of hands-on time, a workflow tool 40%).',
    ],
  };
}
