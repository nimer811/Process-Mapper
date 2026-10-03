import { useQuery } from '@tanstack/react-query';
import type { Findings } from '@process-ai/shared';
import { api } from '@/lib/api';

export function useFindings(versionId: string | undefined) {
  return useQuery({
    queryKey: ['findings', versionId],
    queryFn: () => api<Findings>(`/versions/${versionId}/findings`),
    enabled: !!versionId,
  });
}

/** Map markers: open (non-dismissed) findings per step. */
export function findingCounts(f: Findings | undefined) {
  const counts: Record<string, { issues: number; opportunities: number }> = {};
  for (const i of f?.issues ?? []) {
    if (!i.stepId || i.status === 'dismissed') continue;
    (counts[i.stepId] ??= { issues: 0, opportunities: 0 }).issues++;
  }
  for (const o of f?.opportunities ?? []) {
    if (!o.stepId || o.status === 'dismissed') continue;
    (counts[o.stepId] ??= { issues: 0, opportunities: 0 }).opportunities++;
  }
  return counts;
}
