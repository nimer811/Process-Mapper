import { z } from 'zod';
import { InterviewStage, InterviewStatus } from './process.js';

export const sessionKinds = ['primary', 'contribution'] as const;
export const SessionKind = z.enum(sessionKinds);

/** Someone whose interview feeds this version: the first interviewee, or a colleague invited to add their view. */
export const Contributor = z.object({
  sessionId: z.uuid(),
  user: z.object({ id: z.uuid(), displayName: z.string(), department: z.string().nullable() }),
  kind: SessionKind,
  focus: z.string().nullable(),
  invitedBy: z.string().nullable(),
  stage: InterviewStage,
  status: InterviewStatus,
  turnCount: z.number().int(),
  lastActivityAt: z.iso.datetime(),
});
export type Contributor = z.infer<typeof Contributor>;

export const InviteContributorInput = z.object({
  userId: z.uuid(),
  /** The part of the process to focus on, e.g. "approvals and payment". */
  focus: z.string().trim().max(300).optional(),
});

export const disagreementFields = [
  'actor',
  'sla',
  'expected_duration',
  'approval_authority',
  'execution',
  'remove',
  'statement',
] as const;
export const DisagreementField = z.enum(disagreementFields);
export type DisagreementField = z.infer<typeof DisagreementField>;

export const disagreementStatuses = ['open', 'resolved'] as const;

export const DisagreementSide = z.object({
  value: z.string(),
  user: z
    .object({ id: z.uuid(), displayName: z.string(), department: z.string().nullable() })
    .nullable(),
  quote: z.string().nullable(),
});

/** The AI's suggestion for settling a disagreement; the owner decides. */
export const DisagreementRecommendation = z.object({
  choice: z.enum(['current', 'proposed', 'both', 'unclear']),
  suggestedValue: z.string().nullable(),
  reasoning: z.string(),
  sources: z.array(z.string()),
});
export type DisagreementRecommendation = z.infer<typeof DisagreementRecommendation>;

/** Two people described the same thing differently. Never applied until the owner decides. */
export const Disagreement = z.object({
  id: z.uuid(),
  entityType: z.enum(['step', 'edge', 'rule']),
  entityId: z.uuid(),
  /** What it is about, e.g. 'Step S4 "Approve supplier"'. */
  subject: z.string(),
  field: DisagreementField,
  current: DisagreementSide,
  proposed: DisagreementSide,
  recommendation: DisagreementRecommendation.nullable(),
  status: z.enum(disagreementStatuses),
  resolution: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type Disagreement = z.infer<typeof Disagreement>;

export const ResolveDisagreementInput = z.object({
  /** keep: the current version stands; accept: apply what the second person said. */
  decision: z.enum(['keep', 'accept']),
  note: z.string().trim().max(1000).optional(),
});

export const AskAboutDisagreementInput = z.object({
  /** Whose interview to send the question to. */
  side: z.enum(['current', 'proposed']),
});
