import { useQuery } from '@tanstack/react-query';
import type { Coverage, EndToEndFlow, ProcessCategory, ProcessLink } from '@process-ai/shared';
import { api } from '@/lib/api';

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api<ProcessCategory[]>('/categories'),
  });
}

export function useProcessLinks(processId: string) {
  return useQuery({
    queryKey: ['process-links', processId],
    queryFn: () => api<ProcessLink[]>(`/processes/${processId}/links`),
  });
}

export function useFlow(processId: string) {
  return useQuery({
    queryKey: ['flow', processId],
    queryFn: () => api<EndToEndFlow>(`/processes/${processId}/flow`),
  });
}

export function useCoverage(departmentSlug: string) {
  return useQuery({
    queryKey: ['coverage', departmentSlug],
    queryFn: () => api<Coverage>(`/departments/${departmentSlug}/coverage`),
    enabled: !!departmentSlug,
  });
}

/** Tree order with depth, for indented pickers and lists. */
export function flattenTree(all: ProcessCategory[]) {
  const children = new Map<string | null, ProcessCategory[]>();
  for (const c of all) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c]);
  const out: (ProcessCategory & { depth: number })[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const c of (children.get(parent) ?? []).sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true }),
    )) {
      out.push({ ...c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
