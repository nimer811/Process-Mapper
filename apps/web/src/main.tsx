import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/auth/auth';
import { router } from '@/router';
import { initSystemTheme } from '@/lib/theme';
import { initEntra } from '@/auth/entra';
import { setAccessCodeRequired } from '@/auth/access-code';
import type { AuthConfig } from '@process-ai/shared';
import './index.css';

initSystemTheme();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

// Sign-in mode comes from the API (dev users locally, Microsoft Entra ID in the pilot).
const authConfig: AuthConfig = await fetch('/api/v1/auth/config')
  .then((r) => (r.ok ? r.json() : { mode: 'dev', accessCodeRequired: false, entra: null }))
  .catch(() => ({ mode: 'dev', accessCodeRequired: false, entra: null }));
setAccessCodeRequired(authConfig.accessCodeRequired);
if (authConfig.mode === 'entra' && authConfig.entra) await initEntra(authConfig.entra);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
