import { useQuery } from '@tanstack/react-query';
import type { Contributor, Disagreement } from '@process-ai/shared';
import { api } from '@/lib/api';

export function useContributors(versionId: string) {
  return useQuery({
    queryKey: ['contributors', versionId],
    queryFn: () => api<Contributor[]>(`/versions/${versionId}/contributors`),
  });
}

/** Refetches while a recommendation is still being prepared in the background. */
export function useDisagreements(versionId: string, enabled = true) {
  return useQuery({
    queryKey: ['disagreements', versionId],
    queryFn: () => api<Disagreement[]>(`/versions/${versionId}/disagreements`),
    enabled,
    refetchInterval: (q) =>
      q.state.data?.some((d) => d.status === 'open' && !d.recommendation) ? 3000 : false,
  });
}
