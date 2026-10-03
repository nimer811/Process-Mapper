import { Navigate, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { DevUser } from '@process-ai/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/auth/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function LoginPage() {
  const { user, signInAsDevUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const devUsers = useQuery({
    queryKey: ['dev-users'],
    queryFn: () => api<DevUser[]>('/auth/dev-users'),
  });

  if (user) return <Navigate to={from} replace />;

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
            Development mode: choose a seeded user. Microsoft Entra ID sign-in replaces this in the
            pilot environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
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
