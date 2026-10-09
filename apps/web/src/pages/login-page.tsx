import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DevUser } from '@process-ai/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/auth/auth';
import { isEntra, isSignedIn, signInWithMicrosoft } from '@/auth/entra';
import { accessCodeRequired, getAccessCode, submitAccessCode } from '@/auth/access-code';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function LoginPage() {
  const { user, signInAsDevUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const entra = isEntra();
  const queryClient = useQueryClient();
  const [hasCode, setHasCode] = useState(() => !accessCodeRequired() || !!getAccessCode());
  const devUsers = useQuery({
    queryKey: ['dev-users'],
    queryFn: () => api<DevUser[]>('/auth/dev-users'),
    enabled: !entra && hasCode,
  });

  if (user) return <Navigate to={from} replace />;
  if (!hasCode)
    return (
      <AccessCodeGate
        onDone={() => {
          setHasCode(true);
          void queryClient.invalidateQueries({ queryKey: ['me'] });
        }}
      />
    );

  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="size-8 rounded-md" />
            <span className="text-lg font-semibold">Process AI</span>
          </div>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            {entra
              ? 'Sign in with your organisation account.'
              : 'Development mode: choose a seeded user. Microsoft Entra ID sign-in is used in the pilot environment.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {entra && (
            <>
              <Button className="h-11" onClick={() => void signInWithMicrosoft()}>
                Sign in with Microsoft
              </Button>
              {isSignedIn() && !user && (
                <p className="text-destructive text-sm">
                  Your account is signed in but has no access to Process AI. Ask an administrator.
                </p>
              )}
            </>
          )}
          {devUsers.isPending &&
            Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          {devUsers.isError && (
            <p className="text-destructive text-sm">
              Couldn't load users. Is the API running and the database seeded?
            </p>
          )}
          {devUsers.data?.map((u) => (
            <Button
              key={u.id}
              variant="outline"
              className="h-auto justify-between py-3"
              onClick={async () => {
                await signInAsDevUser(u.id);
                navigate(from, { replace: true });
              }}
            >
              <span className="grid text-left">
                <span className="font-medium">{u.displayName}</span>
                <span className="text-muted-foreground text-xs font-normal">{u.email}</span>
              </span>
              {u.roles.includes('admin') && <Badge variant="secondary">Admin</Badge>}
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/** Demo protection: one code for the whole demo, asked for once per browser. */
function AccessCodeGate({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const ok = await submitAccessCode(code).catch(() => false);
    setBusy(false);
    if (ok) onDone();
    else setError('That access code is not right.');
  };
  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="size-8 rounded-md" />
            <span className="text-lg font-semibold">Process AI</span>
          </div>
          <CardTitle>Demo access</CardTitle>
          <CardDescription>Enter the access code you were given.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3">
            <Input
              type="password"
              autoFocus
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-label="Access code"
              placeholder="Access code"
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" disabled={busy || !code.trim()}>
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
