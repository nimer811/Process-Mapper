import { z } from 'zod';

export const docClassifications = ['public', 'internal', 'confidential', 'restricted'] as const;
export const DocClassification = z.enum(docClassifications);
export type DocClassification = z.infer<typeof DocClassification>;

export const sopStatuses = ['draft', 'published'] as const;

/**
 * Wording the AI drafts for an SOP from the process map (never new facts). The owner reviews and
 * can edit it before publishing.
 */
export const SopWording = z.object({
  purpose: z.string(),
  scopeIn: z.array(z.string()),
  scopeOut: z.array(z.string()),
  definitions: z.array(z.object({ term: z.string(), meaning: z.string() })),
  roles: z.array(z.object({ role: z.string(), responsibilities: z.string() })),
  /** One imperative instruction per step, keyed by step key. */
  steps: z.array(z.object({ stepKey: z.string(), instruction: z.string() })),
  exceptions: z.array(
    z.object({
      exception: z.string(),
      detection: z.string(),
      handling: z.string(),
      escalation: z.string(),
    }),
  ),
  risks: z.array(
    z.object({
      risk: z.string(),
      cause: z.string(),
      impact: z.string(),
      controls: z.array(z.string()),
    }),
  ),
  training: z.array(z.object({ role: z.string(), training: z.string() })),
});
export type SopWording = z.infer<typeof SopWording>;

export const SopDocument = z.object({
  id: z.uuid(),
  versionId: z.uuid(),
  /** e.g. 7X-PRC-SOP-001 */
  docId: z.string(),
  docVersion: z.string(),
  status: z.enum(sopStatuses),
  classification: DocClassification,
  reviewCycleMonths: z.number().int(),
  wording: SopWording,
  /** True when the wording came from the AI (false: built from the map only, e.g. no model configured). */
  aiDrafted: z.boolean(),
  generatedAt: z.iso.datetime(),
  generatedBy: z.string().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  knowledgeDocumentId: z.uuid().nullable(),
});
export type SopDocument = z.infer<typeof SopDocument>;

/** What the SOP tab needs: the current draft/published SOP (if any) and what the viewer may do. */
export const SopState = z.object({
  sop: SopDocument.nullable(),
  canGenerate: z.boolean(),
  /** Publishing requires an approved version. */
  canPublish: z.boolean(),
  publishBlockedReason: z.string().nullable(),
});
export type SopState = z.infer<typeof SopState>;

export const SopPatch = z.object({
  classification: DocClassification.optional(),
  reviewCycleMonths: z.number().int().min(1).max(60).optional(),
  wording: SopWording.optional(),
});
