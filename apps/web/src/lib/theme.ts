import { useSyncExternalStore } from 'react';

const query = '(prefers-color-scheme: dark)';

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(query);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

const isDark = () => window.matchMedia(query).matches;

/** Follows the OS colour scheme and keeps the `dark` class on <html> in sync. */
export function initSystemTheme() {
  const apply = () => document.documentElement.classList.toggle('dark', isDark());
  apply();
  subscribe(apply);
}

export function useColorScheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribe, () => (isDark() ? 'dark' : 'light'), () => 'light');
}
