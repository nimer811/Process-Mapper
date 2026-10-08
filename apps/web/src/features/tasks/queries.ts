import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Task } from '@process-ai/shared';
import { api } from '@/lib/api';

/** The signed-in person's actions; refreshed in the background so the badge stays current. */
export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<Task[]>('/tasks'),
    refetchInterval: 30_000,
  });
}

export function useOpenTaskCount() {
  return useTasks().data?.filter((t) => t.status === 'open').length ?? 0;
}

export function useDismissTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/tasks/${id}/dismiss`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
