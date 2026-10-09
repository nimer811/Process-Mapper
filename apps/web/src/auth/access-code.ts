const KEY = 'process-ai.access-code';
let required = false;

/** Demo protection: the code is entered once on the sign-in page and sent with every API call. */
export const setAccessCodeRequired = (value: boolean) => {
  required = value;
};
export const accessCodeRequired = () => required;

export function getAccessCode(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setAccessCode(code: string | null) {
  try {
    if (code) localStorage.setItem(KEY, code);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: the code lasts for this page load only.
  }
}

/** Checks a code with the API and remembers it when right. */
export async function submitAccessCode(code: string) {
  const res = await fetch('/api/v1/auth/access', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (res.ok) setAccessCode(code.trim());
  return res.ok;
}
