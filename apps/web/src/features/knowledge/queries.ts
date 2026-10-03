import { useQuery } from '@tanstack/react-query';
import type { KnowledgeBase, KnowledgeDocument } from '@process-ai/shared';
import { api } from '@/lib/api';

export function useKnowledgeBases() {
  return useQuery({ queryKey: ['knowledge-bases'], queryFn: () => api<KnowledgeBase[]>('/knowledge-bases') });
}

/** Polls while any document is still being indexed. */
export function useKnowledgeDocuments(knowledgeBaseId: string | undefined) {
  return useQuery({
    queryKey: ['knowledge-documents', knowledgeBaseId],
    queryFn: () => api<KnowledgeDocument[]>(`/knowledge-bases/${knowledgeBaseId}/documents`),
    enabled: !!knowledgeBaseId,
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === 'pending' || d.status === 'processing') ? 2000 : false),
  });
}

export function useProcessDocuments(processId: string) {
  return useQuery({
    queryKey: ['process-documents', processId],
    queryFn: () => api<KnowledgeDocument[]>(`/processes/${processId}/documents`),
  });
}

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
