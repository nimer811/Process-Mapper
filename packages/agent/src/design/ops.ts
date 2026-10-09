import { z } from 'zod';

const Ref = z
  .string()
  .describe(
    'Existing step key such as "S4", or a ref such as "new1" from add_step earlier in the list',
  );
const Why = {
  rationale: z
    .string()
    .describe('Why this change, in one or two sentences, tied to the opportunity or goal'),
  opportunity: z
    .string()
    .nullable()
    .describe('Opportunity label such as "O2", or null if it serves a stated goal'),
  sources: z
    .array(z.string())
    .describe(
      'Labels of reference documents ("D1") or best practices ("BP2") this relies on; [] if none',
    ),
};
const execution = z.enum(['manual', 'automated', 'semi_automated', 'unknown']);
const stepType = z.enum(['task', 'decision', 'approval', 'end']);

/** The closed set of changes a To-Be design may make. Applied by code, never directly by the model. */
export const DesignOp = z.union([
  z.object({
    op: z.literal('modify_step'),
    step: Ref,
    name: z.string().nullable(),
    type: stepType.nullable(),
    description: z.string().nullable(),
    actor: z.string().nullable(),
    systems: z.array(z.string()).nullable().describe('Replaces the step systems; null keeps them'),
    execution: execution.nullable(),
    sla: z.string().nullable(),
    expected_duration: z.string().nullable(),
    approval_authority: z.string().nullable(),
    ...Why,
  }),
  z.object({ op: z.literal('remove_step'), step: Ref, ...Why }),
  z.object({
    op: z.literal('add_step'),
    ref: z.string(),
    type: stepType,
    name: z.string(),
    description: z.string().nullable(),
    actor: z.string().nullable(),
    systems: z.array(z.string()),
    execution,
    sla: z.string().nullable(),
    after: Ref.nullable().describe(
      'Step it follows; it is inserted between this step and its next step',
    ),
    before: Ref.nullable().describe(
      'Step it leads to, when different from the next step of "after"',
    ),
    ...Why,
  }),
  z.object({
    op: z.literal('add_connection'),
    from: Ref,
    to: Ref,
    type: z.enum(['sequence', 'branch', 'exception', 'alternate', 'loop_back']),
    condition_label: z.string().nullable(),
    ...Why,
  }),
  z.object({ op: z.literal('remove_connection'), from: Ref, to: Ref, ...Why }),
  z.object({
    op: z.literal('add_rule'),
    step: Ref.nullable(),
    rule_type: z.enum(['threshold', 'approval', 'compliance', 'sla', 'control', 'other']),
    statement: z.string(),
    ...Why,
  }),
  z.object({
    op: z.literal('remove_rule'),
    rule: z.string().describe('Rule label such as "R2"'),
    ...Why,
  }),
]);
export type DesignOp = z.infer<typeof DesignOp>;

/** Who owns the To-Be process and each of its steps (RACI). */
export const OwnershipDesign = z.object({
  process_owner: z.object({
    role: z.string().describe('The one accountable owner role for the whole process'),
    rationale: z.string(),
    sources: z.array(z.string()),
  }),
  raci: z
    .array(
      z.object({
        step: Ref,
        responsible: z
          .string()
          .nullable()
          .describe('Role that does the step (null keeps the current one)'),
        accountable: z.string().describe('Exactly one role that answers for the step'),
        consulted: z.array(z.string()),
        informed: z.array(z.string()),
        rationale: z.string(),
        sources: z.array(z.string()),
      }),
    )
    .max(40),
});
export type OwnershipDesign = z.infer<typeof OwnershipDesign>;

export const DesignResult = z.object({
  summary: z
    .string()
    .describe('3–5 sentences: what the future process looks like and what changed overall'),
  expected_benefits: z.array(z.string()).max(6),
  changes: z.array(DesignOp).max(25),
  ownership: OwnershipDesign,
});
export type DesignResult = z.infer<typeof DesignResult>;
