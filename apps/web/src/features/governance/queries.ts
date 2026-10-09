import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EvidenceItem,
  HistoryEvent,
  Readiness,
  UserRef,
  VersionDiff,
} from '@process-ai/shared';
import { api } from '@/lib/api';

export function useReadiness(versionId: string | undefined) {
  return useQuery({
    queryKey: ['readiness', versionId],
    queryFn: () => api<Readiness>(`/versions/${versionId}/readiness`),
    enabled: !!versionId,
  });
}

export function useHistory(versionId: string | undefined) {
  return useQuery({
    queryKey: ['history', versionId],
    queryFn: () => api<HistoryEvent[]>(`/versions/${versionId}/history`),
    enabled: !!versionId,
  });
}

export function useEvidence(versionId: string, entityId: string | null) {
  return useQuery({
    queryKey: ['evidence', versionId, entityId],
    queryFn: () => api<EvidenceItem[]>(`/versions/${versionId}/evidence?entityId=${entityId}`),
    enabled: !!entityId,
  });
}

export function useCompare(versionId: string | undefined, withId: string | undefined) {
  return useQuery({
    queryKey: ['compare', versionId, withId],
    queryFn: () => api<VersionDiff>(`/versions/${versionId}/compare?with=${withId}`),
    enabled: !!versionId && !!withId,
  });
}

export function useUsers(enabled: boolean) {
  return useQuery({ queryKey: ['users'], queryFn: () => api<UserRef[]>('/users'), enabled });
}

/** Everything that can change after a governance action or an edit. */
export function useRefreshProcess() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [
        'process',
        'processes',
        'version',
        'readiness',
        'history',
        'evidence',
        'compare',
        'interviews',
        'design',
        'findings',
        'controls',
        'sop',
        'ownership',
        'process-links',
        'flow',
        'coverage',
        'tasks',
        'contributors',
        'disagreements',
      ].map((k) => qc.invalidateQueries({ queryKey: [k] })),
    );
}
