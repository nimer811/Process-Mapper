import { Navigate, Outlet, useLocation } from 'react-router';
import type { UserRole } from '@process-ai/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from './auth';

export function RequireAuth() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) {
    return (
      <div className="flex h-svh items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function RequireRole({ role }: { role: UserRole }) {
  const { hasRole } = useAuth();
  return hasRole(role) ? <Outlet /> : <Navigate to="/" replace />;
}
