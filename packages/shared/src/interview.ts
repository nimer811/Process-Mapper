import { z } from 'zod';
import { InterviewStage, InterviewStatus, OpenItemStatus, OpenItemType } from './process.js';

export const Citation = z.object({ documentId: z.uuid(), label: z.string() });
export type Citation = z.infer<typeof Citation>;

export const InterviewMessage = z.object({
  id: z.uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  createdAt: z.iso.datetime(),
  /** Reference documents the message relies on (e.g. the SOP behind a contradiction question). */
  citations: z.array(Citation),
});
export type InterviewMessage = z.infer<typeof InterviewMessage>;

export const InterviewSummary = z.object({
  id: z.uuid(),
  processId: z.uuid(),
  processName: z.string(),
  departmentName: z.string(),
  versionId: z.uuid(),
  user: z.object({ id: z.uuid(), displayName: z.string() }),
  stage: InterviewStage,
  status: InterviewStatus,
  completeness: z.number().nullable(),
  turnCount: z.number().int(),
  lastActivityAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type InterviewSummary = z.infer<typeof InterviewSummary>;

export const OpenItem = z.object({
  id: z.uuid(),
  type: OpenItemType,
  description: z.string(),
  status: OpenItemStatus,
  entityId: z.uuid().nullable(),
  timesAsked: z.number().int(),
});
export type OpenItem = z.infer<typeof OpenItem>;

export const InterviewDetail = InterviewSummary.extend({
  messages: z.array(InterviewMessage),
  openItems: z.array(OpenItem),
  aiAvailable: z.boolean(),
});
export type InterviewDetail = z.infer<typeof InterviewDetail>;

export const StartInterviewInput = z.object({
  departmentId: z.uuid(),
  processName: z.string().trim().max(120).nullable().optional(),
});
export type StartInterviewInput = z.infer<typeof StartInterviewInput>;

export const PostMessageInput = z.object({ text: z.string().trim().min(1).max(8000) });

/** Server-sent events streamed while the interviewer replies. */
export type InterviewStreamEvent =
  | { type: 'state'; stage: z.infer<typeof InterviewStage>; completeness: number; changes: string[]; versionId: string }
  | { type: 'token'; text: string }
  | { type: 'message'; message: InterviewMessage }
  | { type: 'error'; message: string };
