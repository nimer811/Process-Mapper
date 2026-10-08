import { z } from 'zod';

/** What a task asks the person to do. */
export const taskKinds = [
  'confirm_points', // interviewee: confirm points sent back from validation
  'continue_interview', // interviewee: an unfinished interview has gone quiet
  'assign_owner', // admin: a process waiting for validation has no owner
  'validate', // process owner: a draft was submitted for validation
  'approve', // admin: a validated version is waiting for approval
  'add_view', // colleague: invited to add their view on a process
  'resolve_disagreements', // process owner: people described the process differently
] as const;
export const TaskKind = z.enum(taskKinds);
export type TaskKind = z.infer<typeof TaskKind>;

export const taskStatuses = ['open', 'done', 'dismissed'] as const;
export const TaskStatus = z.enum(taskStatuses);

export const Task = z.object({
  id: z.uuid(),
  kind: TaskKind,
  title: z.string(),
  detail: z.string().nullable(),
  /** In-app path to act on it. */
  link: z.string(),
  processName: z.string().nullable(),
  status: TaskStatus,
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  /** Nudges can be dismissed; lifecycle tasks close themselves when the action is done. */
  dismissible: z.boolean(),
});
export type Task = z.infer<typeof Task>;
