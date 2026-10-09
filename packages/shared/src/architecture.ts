import { z } from 'zod';
import { VersionStatus } from './process.js';

/** A node of the process classification (APQC PCF style): L1 category → L2 group → L3 process. */
export const ProcessCategory = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  level: z.number().int().min(1).max(4),
  parentId: z.uuid().nullable(),
  /** Department expected to own processes under this node (drives the coverage dashboard). */
  departmentId: z.uuid().nullable(),
  description: z.string().nullable(),
  source: z.string().nullable(),
});
export type ProcessCategory = z.infer<typeof ProcessCategory>;

export const ProcessCategoryInput = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2).max(200),
  parentId: z.uuid().nullable().optional(),
  departmentId: z.uuid().nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  source: z.string().trim().max(200).nullable().optional(),
});

export const CategoryRef = z.object({ id: z.uuid(), code: z.string(), name: z.string() });
export type CategoryRef = z.infer<typeof CategoryRef>;

export const CategorySuggestion = z.object({
  category: CategoryRef.nullable(),
  reasoning: z.string(),
});

/** One process handing off to another, e.g. Vendor Onboarding → Purchase Requisition to PO. */
export const ProcessLink = z.object({
  id: z.uuid(),
  from: z.object({ id: z.uuid(), name: z.string() }),
  to: z.object({ id: z.uuid(), name: z.string() }),
  /** The step in the "from" process where the hand-off happens (if known). */
  fromStepKey: z.string().nullable(),
  label: z.string().nullable(),
  /** AI-suggested links stay inferred until confirmed. */
  provenance: z.enum(['confirmed', 'inferred']),
  reasoning: z.string().nullable(),
});
export type ProcessLink = z.infer<typeof ProcessLink>;

export const ProcessLinkInput = z.object({
  toProcessId: z.uuid(),
  fromStepKey: z.string().trim().max(20).nullable().optional(),
  label: z.string().trim().max(200).nullable().optional(),
});

export const FlowProcess = z.object({
  id: z.uuid(),
  name: z.string(),
  department: z.string(),
  status: VersionStatus,
  stepCount: z.number().int(),
  trigger: z.string().nullable(),
  endCondition: z.string().nullable(),
  category: CategoryRef.nullable(),
});

/** Linked processes around one process, for the end-to-end view. */
export const EndToEndFlow = z.object({
  processes: z.array(FlowProcess),
  links: z.array(ProcessLink),
});
export type EndToEndFlow = z.infer<typeof EndToEndFlow>;

export const CoverageProcess = z.object({
  id: z.uuid(),
  name: z.string(),
  status: VersionStatus,
  sopPublished: z.boolean(),
  /** Approved/validated and past its review date. */
  reviewOverdue: z.boolean(),
  lastReviewedAt: z.iso.datetime().nullable(),
});

/** What a department is expected to document, and how far it has got. */
export const Coverage = z.object({
  totals: z.object({
    expected: z.number().int(),
    mapped: z.number().int(),
    validated: z.number().int(),
    approved: z.number().int(),
    sopPublished: z.number().int(),
    reviewOverdue: z.number().int(),
  }),
  areas: z.array(
    z.object({
      group: CategoryRef,
      items: z.array(z.object({ category: CategoryRef, processes: z.array(CoverageProcess) })),
    }),
  ),
  unclassified: z.array(CoverageProcess),
});
export type Coverage = z.infer<typeof Coverage>;
