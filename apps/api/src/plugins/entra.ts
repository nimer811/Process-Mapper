import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { eq, users, type Db } from '@process-ai/db';
import type { CurrentUser, UserRole } from '@process-ai/shared';
import type { Config } from '../config.js';

export interface EntraVerifier {
  verify(token: string): Promise<CurrentUser | null>;
}

const toUser = (row: typeof users.$inferSelect): CurrentUser => ({
  id: row.id,
  email: row.email,
  displayName: row.displayName,
  department: row.departmentText,
  roles: row.roles,
});

/** Refresh the stored name/roles/last sign-in at most this often per user. */
const TOUCH_MS = 15 * 60 * 1000;

/**
 * Validates Entra ID access tokens (v2 endpoint: signature, issuer, audience, expiry) and maps the
 * signed-in person to a user, creating it on first sign-in. Admins come from an Entra group or app
 * role, so access is managed in Entra; deactivated or erased accounts are refused.
 */
export function entraVerifier(config: Config, db: Db, keys?: JWTVerifyGetKey): EntraVerifier {
  const tenant = config.ENTRA_TENANT_ID!;
  const clientId = config.ENTRA_CLIENT_ID!;
  const issuer = `https://login.microsoftonline.com/${tenant}/v2.0`;
  const jwks =
    keys ??
    createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`));
  const audience = [clientId, `api://${clientId}`];

  const rolesFrom = (p: JWTPayload): UserRole[] => {
    const appRoles = Array.isArray(p.roles) ? (p.roles as string[]) : [];
    const groups = Array.isArray(p.groups) ? (p.groups as string[]) : [];
    const admin =
      appRoles.includes(config.ENTRA_ADMIN_ROLE) ||
      (!!config.ENTRA_ADMIN_GROUP_ID && groups.includes(config.ENTRA_ADMIN_GROUP_ID));
    return admin ? ['user', 'admin'] : ['user'];
  };

  return {
    async verify(token) {
      const { payload } = await jwtVerify(token, jwks, { issuer, audience });
      const oid = typeof payload.oid === 'string' ? payload.oid : null;
      const email = String(
        payload.preferred_username ?? payload.upn ?? payload.email ?? '',
      ).toLowerCase();
      if (!oid || !email) return null;
      const name =
        typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : email;
      const roles = rolesFrom(payload);

      let row =
        (await db.query.users.findFirst({ where: eq(users.entraOid, oid) })) ??
        // First sign-in of someone already known by email (e.g. pre-registered): link the account.
        (await db.query.users.findFirst({ where: eq(users.email, email) }));
      if (row && (!row.isActive || row.erasedAt)) return null;
      if (!row) {
        [row] = await db
          .insert(users)
          .values({ entraOid: oid, email, displayName: name, roles, lastLoginAt: new Date() })
          .onConflictDoNothing()
          .returning();
        row ??= await db.query.users.findFirst({ where: eq(users.entraOid, oid) });
        if (!row) return null;
      } else if (
        row.entraOid !== oid ||
        row.displayName !== name ||
        row.roles.join() !== roles.join() ||
        !row.lastLoginAt ||
        Date.now() - row.lastLoginAt.getTime() > TOUCH_MS
      ) {
        [row] = await db
          .update(users)
          .set({ entraOid: oid, displayName: name, roles, lastLoginAt: new Date() })
          .where(eq(users.id, row.id))
          .returning();
      }
      return toUser(row!);
    },
  };
}
