import { z } from 'zod';

/**
 * The closed set of changes the extraction model may propose. This is the model's only write
 * path: it never edits the database directly, and every op is validated in code before applying.
 * Fields are required-but-nullable (not optional) so the schema works with strict structured output.
 */

const Provenance = z
  .enum(['stated', 'inferred'])
  .describe('"stated" only if the user explicitly said it in their latest message; otherwise "inferred"');
const Quote = z
  .string()
  .nullable()
  .describe('Exact words copied from the user\'s latest message that support this change. Null when inferred.');
const StepRef = z
  .string()
  .describe('An existing step key such as "S3", or a ref such as "new1" introduced by add_step earlier in this list');

const stepTypes = ['start', 'task', 'decision', 'approval', 'end'] as const;
const execution = ['manual', 'automated', 'semi_automated', 'unknown'] as const;

export const SetProcessField = z.object({
  op: z.literal('set_process_field'),
  field: z.enum(['name', 'description', 'purpose', 'trigger', 'end_condition', 'owner_role', 'frequency', 'volume']),
  value: z.string(),
  provenance: Provenance,
  quote: Quote,
});

export const AddStep = z.object({
  op: z.literal('add_step'),
  ref: z.string().describe('Temporary id for this new step, e.g. "new1", usable by later ops in this list'),
  type: z.enum(stepTypes),
  name: z.string().describe('Short verb phrase, e.g. "Review purchase request"; decisions as a question'),
  description: z.string().nullable(),
  actor: z.string().nullable().describe('Role or team that performs the step, e.g. "Procurement Officer"'),
  systems: z.array(z.string()),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  execution: z.enum(execution),
  expected_duration: z.string().nullable(),
  sla: z.string().nullable(),
  approval_authority: z.string().nullable(),
  after: StepRef.nullable().describe('Step this one directly follows; creates the flow connection. Null if unknown.'),
  after_label: z.string().nullable().describe('Condition label when "after" is a decision, e.g. "Yes", "Above AED 50k"'),
  provenance: Provenance,
  quote: Quote,
});

export const UpdateStep = z.object({
  op: z.literal('update_step'),
  step: StepRef,
  name: z.string().nullable(),
  type: z.enum(stepTypes).nullable(),
  description: z.string().nullable(),
  actor: z.string().nullable(),
  add_systems: z.array(z.string()),
  no_system: z.boolean().nullable().describe('True when the user says no system is used for this step'),
  add_inputs: z.array(z.string()),
  add_outputs: z.array(z.string()),
  execution: z.enum(execution).nullable(),
  expected_duration: z.string().nullable(),
  sla: z.string().nullable(),
  approval_authority: z.string().nullable(),
  provenance: Provenance,
  quote: Quote,
});

export const AddEdge = z.object({
  op: z.literal('add_edge'),
  from: StepRef,
  to: StepRef,
  type: z.enum(['sequence', 'branch', 'exception', 'alternate', 'loop_back']),
  condition_label: z.string().nullable(),
  provenance: Provenance,
  quote: Quote,
});

export const RemoveEdge = z.object({
  op: z.literal('remove_edge'),
  from: StepRef,
  to: StepRef,
  reason: z.string(),
});

export const RemoveStep = z.object({
  op: z.literal('remove_step'),
  step: StepRef,
  reason: z.string(),
});

export const AddRule = z.object({
  op: z.literal('add_rule'),
  step: StepRef.nullable().describe('Step the rule applies to, or null for the whole process'),
  rule_type: z.enum(['threshold', 'approval', 'compliance', 'sla', 'control', 'other']),
  statement: z.string(),
  provenance: Provenance,
  quote: Quote,
});

export const AddPainPoint = z.object({
  op: z.literal('add_pain_point'),
  step: StepRef,
  text: z.string(),
  quote: Quote,
});

export const ResolveOpenItem = z.object({
  op: z.literal('resolve_open_item'),
  item: z.string().describe('Open item label such as "Q2"'),
  resolution: z.string().describe('What the user said, or "unknown" if they do not know'),
});

export const RaiseItem = z.object({
  op: z.literal('raise_item'),
  type: z.enum(['ambiguity', 'contradiction', 'assumption', 'question']),
  step: StepRef.nullable(),
  description: z.string().describe('The question to clarify, phrased for the interviewer'),
  priority: z.enum(['high', 'medium', 'low']),
});

export const SetFocus = z.object({
  op: z.literal('set_focus'),
  step: StepRef,
});

// A plain union (JSON Schema anyOf): OpenAI strict structured output rejects oneOf, which
// discriminatedUnion produces. The literal `op` field still tells the variants apart.
export const Op = z.union([
  SetProcessField,
  AddStep,
  UpdateStep,
  AddEdge,
  RemoveEdge,
  RemoveStep,
  AddRule,
  AddPainPoint,
  ResolveOpenItem,
  RaiseItem,
  SetFocus,
]);
export type Op = z.infer<typeof Op>;

export const ExtractionResult = z.object({
  ops: z.array(Op),
  user_intent: z
    .enum(['continue', 'pause', 'finish'])
    .describe('"finish" when the user says they have covered everything; "pause" when they want to stop for now'),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;

export const MAX_OPS_PER_TURN = 25;
