import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  Department,
  ProcessDetail,
  ProcessListItem,
  ProcessListQuery,
  VersionGraph,
} from '@process-ai/shared';
import { api } from '@/lib/api';

export function useDepartments() {
  return useQuery({ queryKey: ['departments'], queryFn: () => api<Department[]>('/departments') });
}

export function useProcesses(query: ProcessListQuery) {
  const params = new URLSearchParams(
    Object.entries(query).filter((e): e is [string, string] => !!e[1]),
  );
  return useQuery({
    queryKey: ['processes', query],
    queryFn: () => api<ProcessListItem[]>(`/processes?${params}`),
    placeholderData: keepPreviousData,
  });
}

export function useProcess(id: string) {
  return useQuery({ queryKey: ['process', id], queryFn: () => api<ProcessDetail>(`/processes/${id}`) });
}

export function useVersionGraph(id: string | undefined) {
  return useQuery({
    queryKey: ['version', id],
    queryFn: () => api<VersionGraph>(`/versions/${id}`),
    enabled: !!id,
  });
}
