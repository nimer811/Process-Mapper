import { describe, expect, it } from 'vitest';
import type { CurrentUser } from '@process-ai/shared';
import { canViewVersion, pickDefaultVersion } from '../src/modules/processes/visibility.js';

const user = (id: string, roles: CurrentUser['roles'] = ['user']): CurrentUser => ({
  id,
  email: `${id}@x`,
  displayName: id,
  department: null,
  roles,
});
const ctx = { ownerUserId: 'owner', processCreatedBy: 'creator' };

describe('canViewVersion', () => {
  it('lets anyone see published versions', () => {
    for (const status of ['validated', 'approved', 'archived'] as const) {
      expect(canViewVersion(user('someone'), { status, createdBy: 'x' }, ctx)).toBe(true);
    }
  });

  it('limits drafts to admins, owner and creators', () => {
    const draft = { status: 'draft' as const, createdBy: 'author' };
    expect(canViewVersion(user('someone'), draft, ctx)).toBe(false);
    expect(canViewVersion(user('someone', ['user', 'admin']), draft, ctx)).toBe(true);
    expect(canViewVersion(user('owner'), draft, ctx)).toBe(true);
    expect(canViewVersion(user('creator'), draft, ctx)).toBe(true);
    expect(canViewVersion(user('author'), draft, ctx)).toBe(true);
  });
});

describe('pickDefaultVersion', () => {
  const v1 = { id: 'v1', versionNumber: 1, status: 'approved' as const, createdBy: 'owner' };
  const v2 = { id: 'v2', versionNumber: 2, status: 'draft' as const, createdBy: 'owner' };

  it('prefers the current published version over a newer draft', () => {
    expect(pickDefaultVersion(user('owner'), [v1, v2], 'v1', ctx)?.id).toBe('v1');
  });

  it('falls back to the newest visible version when nothing is published', () => {
    expect(pickDefaultVersion(user('owner'), [v2], null, ctx)?.id).toBe('v2');
    expect(pickDefaultVersion(user('someone'), [v2], null, ctx)).toBeNull();
  });
});
