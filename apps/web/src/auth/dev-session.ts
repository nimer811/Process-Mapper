const KEY = 'process-ai.dev-user-id';

/** Dev-mode identity: the selected seeded user id, kept in localStorage. */
export function getDevUserId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setDevUserId(id: string | null) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable (private mode): identity lasts for this page load only.
  }
}
