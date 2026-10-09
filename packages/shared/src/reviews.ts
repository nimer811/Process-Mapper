import { z } from 'zod';

export const ProcessAlert = z.object({
  id: z.uuid(),
  kind: z.enum(['document_changed']),
  documentId: z.uuid().nullable(),
  documentTitle: z.string(),
  change: z.string(),
  status: z.enum(['open', 'resolved']),
  resolution: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type ProcessAlert = z.infer<typeof ProcessAlert>;

/** Where a process stands on its periodic review, and what may have changed around it. */
export const ReviewState = z.object({
  /** not_applicable: nothing validated or approved yet. */
  status: z.enum(['not_applicable', 'ok', 'due_soon', 'overdue']),
  lastReviewedAt: z.iso.datetime().nullable(),
  dueAt: z.iso.datetime().nullable(),
  cycleMonths: z.number().int(),
  canReview: z.boolean(),
  alerts: z.array(ProcessAlert),
});
export type ReviewState = z.infer<typeof ReviewState>;

export const MarkReviewedInput = z.object({ comment: z.string().trim().max(1000).optional() });
export const ResolveAlertInput = z.object({ resolution: z.string().trim().min(2).max(1000) });
