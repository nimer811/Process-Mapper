import { DEV_USER_HEADER } from '@process-ai/shared';
import { getDevUserId } from './dev-session';
import { entraToken, isEntra } from './entra';

/** Identity for API calls: an Entra access token, or the chosen dev user. */
export async function authHeaders(): Promise<Record<string, string>> {
  if (isEntra()) {
    const token = await entraToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  }
  const devUserId = getDevUserId();
  return devUserId ? { [DEV_USER_HEADER]: devUserId } : {};
}
