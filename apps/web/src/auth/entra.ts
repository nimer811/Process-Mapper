import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
} from '@azure/msal-browser';
import type { AuthConfig } from '@process-ai/shared';

/**
 * Microsoft Entra ID sign-in for the SPA (authorization code + PKCE via MSAL). Tokens stay in
 * session storage; each API call gets a fresh access token for the API's scope.
 */
let msal: PublicClientApplication | null = null;
let scope = '';

export const isEntra = () => !!msal;

export async function initEntra(config: NonNullable<AuthConfig['entra']>) {
  scope = config.scope;
  msal = new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      redirectUri: `${window.location.origin}/`,
      postLogoutRedirectUri: `${window.location.origin}/login`,
    },
    cache: { cacheLocation: 'sessionStorage' },
  });
  await msal.initialize();
  const result = await msal.handleRedirectPromise();
  const account = result?.account ?? msal.getAllAccounts()[0] ?? null;
  if (account) msal.setActiveAccount(account);
}

const account = (): AccountInfo | null =>
  msal?.getActiveAccount() ?? msal?.getAllAccounts()[0] ?? null;

export const isSignedIn = () => !!account();

export async function signInWithMicrosoft() {
  await msal!.loginRedirect({ scopes: [scope] });
}

export async function signOutOfMicrosoft() {
  await msal!.logoutRedirect({ account: account() ?? undefined });
}

/** A current access token for the API, or null when not signed in (redirects if consent is needed). */
export async function entraToken(): Promise<string | null> {
  const a = account();
  if (!msal || !a) return null;
  try {
    return (await msal.acquireTokenSilent({ scopes: [scope], account: a })).accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      await msal.acquireTokenRedirect({ scopes: [scope], account: a });
    }
    return null;
  }
}
