import { DEV_USER_HEADER } from '@process-ai/shared';
import { getDevUserId } from './dev-session';
import { entraToken, isEntra } from './entra';
import { getAccessCode } from './access-code';

/** Identity for API calls: an Entra access token, or the chosen dev user. */
export async function authHeaders(): Promise<Record<string, string>> {
  const code = getAccessCode();
  const access: Record<string, string> = code ? { 'x-access-code': code } : {};
  if (isEntra()) {
    const token = await entraToken();
    return token ? { ...access, authorization: `Bearer ${token}` } : access;
  }
  const devUserId = getDevUserId();
  return devUserId ? { ...access, [DEV_USER_HEADER]: devUserId } : access;
}
