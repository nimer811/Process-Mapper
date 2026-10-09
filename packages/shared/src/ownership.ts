import { z } from 'zod';

export const practiceCategories = [
  'ownership',
  'segregation_of_duties',
  'delegation_of_authority',
  'control',
  'compliance',
  'efficiency',
] as const;
export const PracticeCategory = z.enum(practiceCategories);
export type PracticeCategory = z.infer<typeof PracticeCategory>;

/** An organisation-wide good practice the To-Be designer and the checks draw on (admin-editable). */
export const BestPractice = z.object({
  id: z.uuid(),
  title: z.string(),
  statement: z.string(),
  category: PracticeCategory,
  /** Words that make it relevant to a process, e.g. ["supplier", "vendor", "bank"]. Empty = always. */
  keywords: z.array(z.string()),
  departmentId: z.uuid().nullable(),
  source: z.string().nullable(),
  isActive: z.boolean(),
});
export type BestPractice = z.infer<typeof BestPractice>;

export const BestPracticeInput = z.object({
  title: z.string().trim().min(3).max(200),
  statement: z.string().trim().min(10).max(2000),
  category: PracticeCategory,
  keywords: z.array(z.string().trim().min(2).max(40)).max(20).optional(),
  departmentId: z.uuid().nullable().optional(),
  source: z.string().trim().max(300).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type BestPracticeInput = z.infer<typeof BestPracticeInput>;

export const checkKinds = [
  'segregation_of_duties',
  'delegation_of_authority',
  'control_gap',
  'ownership',
] as const;

/** A finding from the automatic ownership and control checks (code, not AI). */
export const DesignCheck = z.object({
  kind: z.enum(checkKinds),
  severity: z.enum(['high', 'medium', 'low']),
  title: z.string(),
  detail: z.string(),
  stepKeys: z.array(z.string()),
  recommendation: z.string(),
  /** Title of the best practice it relates to, if any. */
  practice: z.string().nullable(),
});
export type DesignCheck = z.infer<typeof DesignCheck>;

export const OwnershipView = z.object({
  processOwnerRole: z.string().nullable(),
  /** One row per work step: R (doer), A, C, I. */
  raci: z.array(
    z.object({
      stepId: z.uuid(),
      stepKey: z.string(),
      name: z.string(),
      responsible: z.string().nullable(),
      accountable: z.string().nullable(),
      consulted: z.array(z.string()),
      informed: z.array(z.string()),
    }),
  ),
  checks: z.array(DesignCheck),
});
export type OwnershipView = z.infer<typeof OwnershipView>;
