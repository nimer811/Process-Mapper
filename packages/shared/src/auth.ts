import { z } from 'zod';

export const userRoles = ['user', 'admin'] as const;
export const UserRole = z.enum(userRoles);
export type UserRole = z.infer<typeof UserRole>;

export const CurrentUser = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  department: z.string().nullable(),
  roles: z.array(UserRole),
});
export type CurrentUser = z.infer<typeof CurrentUser>;

export const DevUser = CurrentUser.pick({ id: true, email: true, displayName: true, roles: true });
export type DevUser = z.infer<typeof DevUser>;

/** Header used by the SPA in AUTH_MODE=dev to identify the selected seeded user. */
export const DEV_USER_HEADER = 'x-dev-user-id';

/** How the web app signs people in (public). */
export const AuthConfig = z.object({
  mode: z.enum(['dev', 'entra']),
  entra: z.object({ tenantId: z.string(), clientId: z.string(), scope: z.string() }).nullable(),
});
export type AuthConfig = z.infer<typeof AuthConfig>;
