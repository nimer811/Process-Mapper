import { describe, expect, it } from 'vitest';
import { allowedActions, canEditVersion, checkTransition } from '../src/modules/governance/lifecycle.js';

const admin = { isAdmin: true, isOwner: false, isCreator: false };
const owner = { isAdmin: false, isOwner: true, isCreator: false };
const creator = { isAdmin: false, isOwner: false, isCreator: true };
const other = { isAdmin: false, isOwner: false, isCreator: false };

describe('lifecycle rules', () => {
  it('lets the interviewee submit a draft but only owners/admins validate', () => {
    expect(allowedActions('draft', creator, false)).toEqual(['submit']);
    expect(allowedActions('under_validation', creator, false)).toEqual([]);
    expect(allowedActions('under_validation', owner, false)).toEqual(['validate', 'return']);
    expect(allowedActions('validated', owner, false)).toEqual([]);
    expect(allowedActions('validated', admin, false)).toEqual(['approve']);
    expect(allowedActions('draft', other, false)).toEqual([]);
  });

  it('blocks validation while there are unresolved items', () => {
    expect(allowedActions('under_validation', owner, true)).toEqual(['return']);
    expect(checkTransition('under_validation', 'validate', owner, { hasBlockers: true })).toMatchObject({ ok: false, status: 409 });
  });

  it('requires a comment to return, and rejects invalid moves', () => {
    expect(checkTransition('under_validation', 'return', owner, { hasBlockers: false })).toMatchObject({ ok: false, status: 400 });
    expect(checkTransition('approved', 'validate', admin, { hasBlockers: false })).toMatchObject({ ok: false, status: 409 });
    expect(checkTransition('validated', 'approve', owner, { hasBlockers: false })).toMatchObject({ ok: false, status: 403 });
  });

  it('locks validated and approved versions for editing', () => {
    expect(canEditVersion('draft', creator)).toBe(true);
    expect(canEditVersion('under_validation', creator)).toBe(false);
    expect(canEditVersion('under_validation', owner)).toBe(true);
    expect(canEditVersion('validated', admin)).toBe(false);
    expect(canEditVersion('approved', owner)).toBe(false);
  });
});
