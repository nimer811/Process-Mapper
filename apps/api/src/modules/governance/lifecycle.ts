import type { LifecycleAction, VersionStatus } from '@process-ai/shared';

export interface Actor {
  isAdmin: boolean;
  /** Owner of the process. */
  isOwner: boolean;
  /** Created this version (e.g. the interviewee). */
  isCreator: boolean;
}

interface Rule {
  from: VersionStatus[];
  to: VersionStatus;
  allowed: (a: Actor) => boolean;
  needsComment?: boolean;
  /** Blocked while AI inferences or SOP contradictions are unresolved. */
  respectsBlockers?: boolean;
}

/**
 * Process lifecycle: Draft → Under validation → Validated (owner) → Approved (admin).
 * Kept as data so the rules are visible in one place and easy to test.
 */
export const LIFECYCLE: Record<LifecycleAction, Rule> = {
  submit: {
    from: ['draft'],
    to: 'under_validation',
    allowed: (a) => a.isAdmin || a.isOwner || a.isCreator,
  },
  validate: {
    from: ['under_validation'],
    to: 'validated',
    allowed: (a) => a.isAdmin || a.isOwner,
    respectsBlockers: true,
  },
  return: {
    from: ['under_validation'],
    to: 'draft',
    allowed: (a) => a.isAdmin || a.isOwner,
    needsComment: true,
  },
  approve: { from: ['validated'], to: 'approved', allowed: (a) => a.isAdmin },
};

export type TransitionCheck =
  { ok: true; to: VersionStatus } | { ok: false; status: 400 | 403 | 409; reason: string };

export function checkTransition(
  status: VersionStatus,
  action: LifecycleAction,
  actor: Actor,
  opts: { hasBlockers: boolean; comment?: string },
): TransitionCheck {
  const rule = LIFECYCLE[action];
  if (!rule.allowed(actor))
    return {
      ok: false,
      status: 403,
      reason: `You don't have permission to ${action} this process`,
    };
  if (!rule.from.includes(status))
    return {
      ok: false,
      status: 409,
      reason: `Can't ${action} a version that is ${status.replace('_', ' ')}`,
    };
  if (rule.respectsBlockers && opts.hasBlockers) {
    return {
      ok: false,
      status: 409,
      reason: 'Resolve the open items (AI inferences, contradictions, owner) before validating',
    };
  }
  if (rule.needsComment && !opts.comment?.trim())
    return { ok: false, status: 400, reason: 'Add a comment explaining what needs to change' };
  return { ok: true, to: rule.to };
}

export function allowedActions(
  status: VersionStatus,
  actor: Actor,
  hasBlockers: boolean,
): LifecycleAction[] {
  return (Object.keys(LIFECYCLE) as LifecycleAction[]).filter(
    (action) => checkTransition(status, action, actor, { hasBlockers, comment: 'x' }).ok,
  );
}

/** Content can be edited while a version is being prepared or reviewed. */
export function canEditVersion(status: VersionStatus, actor: Actor) {
  if (status === 'draft') return actor.isAdmin || actor.isOwner || actor.isCreator;
  if (status === 'under_validation') return actor.isAdmin || actor.isOwner;
  return false;
}
