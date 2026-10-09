import { z } from 'zod';
import { Provenance } from './process.js';

export const controlTypes = ['preventive', 'detective'] as const;
export const ControlType = z.enum(controlTypes);
export const controlModes = ['manual', 'automated', 'it_dependent'] as const;
export const ControlMode = z.enum(controlModes);

/**
 * The activity that enforces a rule or reduces a risk (COSO-style), e.g. "Bank details verified by
 * call-back before activation". Rules say what must be true; controls are how that is ensured.
 */
export const Control = z.object({
  id: z.uuid(),
  /** Unique within the department, e.g. PRC-C-004. Kept across versions. */
  controlKey: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  controlType: ControlType,
  mode: ControlMode,
  frequency: z.string().nullable(),
  ownerRole: z.string().nullable(),
  /** The record that proves the control ran. */
  evidence: z.string().nullable(),
  isKey: z.boolean(),
  risk: z.string().nullable(),
  ruleId: z.uuid().nullable(),
  stepIds: z.array(z.uuid()),
  provenance: Provenance,
});
export type Control = z.infer<typeof Control>;

export const ControlInput = z.object({
  name: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  controlType: ControlType,
  mode: ControlMode,
  frequency: z.string().trim().max(120).nullable().optional(),
  ownerRole: z.string().trim().max(120).nullable().optional(),
  evidence: z.string().trim().max(500).nullable().optional(),
  isKey: z.boolean().optional(),
  risk: z.string().trim().max(500).nullable().optional(),
  ruleId: z.uuid().nullable().optional(),
  stepIds: z.array(z.uuid()).max(30).optional(),
});
export type ControlInput = z.infer<typeof ControlInput>;
