import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CurrentUser, UserRole } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { setDevUserId } from './dev-session';
import { isEntra, signOutOfMicrosoft } from './entra';

interface AuthState {
  user: CurrentUser | null;
  isLoading: boolean;
  signInAsDevUser: (id: string) => Promise<void>;
  signOut: () => void;
  hasRole: (role: UserRole) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<CurrentUser>('/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
  });

  const value: AuthState = {
    user: me.data ?? null,
    isLoading: me.isPending,
    signInAsDevUser: async (id) => {
      setDevUserId(id);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    signOut: () => {
      if (isEntra()) {
        queryClient.clear();
        void signOutOfMicrosoft();
        return;
      }
      setDevUserId(null);
      queryClient.clear();
      // A full load of the sign-in page resets every cached query and open stream for the old user.
      window.location.assign('/login');
    },
    hasRole: (role) => me.data?.roles.includes(role) ?? false,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
