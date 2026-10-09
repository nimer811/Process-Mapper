import { z } from 'zod';
import { OpportunityKind } from './process.js';

/** Where a figure comes from: the owner, what the employee said (text), or an AI estimate. */
export const FigureSource = z.enum(['owner', 'stated', 'ai']);
export type FigureSource = z.infer<typeof FigureSource>;

const Figure = z.object({ value: z.number().nullable(), source: FigureSource.nullable() });

export const StepValue = z.object({
  stepId: z.uuid(),
  stepKey: z.string(),
  name: z.string(),
  actor: z.string().nullable(),
  onMainPath: z.boolean(),
  /** Elapsed working minutes for the step (including waiting). */
  duration: Figure,
  /** Hands-on working minutes. */
  effort: Figure,
});
export type StepValue = z.infer<typeof StepValue>;

export const OpportunityValue = z.object({
  id: z.uuid(),
  title: z.string(),
  kind: OpportunityKind,
  status: z.string(),
  stepKey: z.string().nullable(),
  /** Estimated hands-on hours saved per month; null when effort or volume is unknown. */
  hoursSavedPerMonth: z.number().nullable(),
  assumption: z.string(),
});

/** Timings, volume and value for one version. Facts stay in the map; estimates live alongside. */
export const ValueView = z.object({
  volumePerMonth: Figure,
  /** Working minutes along the main path (start to end, without exceptions or loops). */
  cycleMinutes: z.number().nullable(),
  touchMinutes: z.number().nullable(),
  waitShare: z.number().nullable(),
  effortHoursPerMonth: z.number().nullable(),
  completeness: z.object({ duration: z.number(), effort: z.number() }),
  steps: z.array(StepValue),
  opportunities: z.array(OpportunityValue),
  /** Owner or admin may set figures. */
  canEdit: z.boolean(),
  /** …and ask the AI to estimate (needs a model). */
  canEstimate: z.boolean(),
  assumptions: z.array(z.string()),
});
export type ValueView = z.infer<typeof ValueView>;

/** The owner sets a step's effort/duration or the volume (null clears the owner's figure). */
export const ValueFigureInput = z.object({
  stepId: z.uuid().nullable(),
  effortMinutes: z.number().min(0).max(100_000).nullable().optional(),
  durationMinutes: z.number().min(0).max(1_000_000).nullable().optional(),
  volumePerMonth: z.number().min(0).max(1_000_000).nullable().optional(),
});
