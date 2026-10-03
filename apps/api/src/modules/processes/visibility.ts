import type { CurrentUser, VersionStatus } from '@process-ai/shared';

const PUBLISHED: readonly VersionStatus[] = ['validated', 'approved', 'archived'];

export interface VisibilityContext {
  ownerUserId: string | null;
  processCreatedBy: string | null;
}

/**
 * Pilot visibility rules:
 * - validated / approved / archived versions: any signed-in user
 * - draft / under_validation: admins, the process owner, and whoever created the version or process
 */
export function canViewVersion(
  user: CurrentUser,
  version: { status: VersionStatus; createdBy: string | null },
  ctx: VisibilityContext,
): boolean {
  if (PUBLISHED.includes(version.status)) return true;
  if (user.roles.includes('admin')) return true;
  return [ctx.ownerUserId, ctx.processCreatedBy, version.createdBy].includes(user.id);
}

/**
 * The version shown by default: the current (latest validated/approved) version if any,
 * otherwise the newest version the user may see.
 */
export function pickDefaultVersion<
  V extends { id: string; versionNumber: number; status: VersionStatus; createdBy: string | null; kind?: 'as_is' | 'to_be' },
>(
  user: CurrentUser,
  versions: V[],
  currentVersionId: string | null,
  ctx: VisibilityContext,
): V | null {
  const current = currentVersionId ? versions.find((v) => v.id === currentVersionId) : undefined;
  if (current) return current;
  return (
    [...versions]
      // Prefer the documented current state (As-Is) over To-Be designs.
      .sort((a, b) => Number(a.kind === 'to_be') - Number(b.kind === 'to_be') || b.versionNumber - a.versionNumber)
      .find((v) => canViewVersion(user, v, ctx)) ?? null
  );
}
