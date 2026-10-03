import { useQuery } from '@tanstack/react-query';
import type { InterviewDetail, InterviewSummary } from '@process-ai/shared';
import { api } from '@/lib/api';

export function useInterviews(all = false) {
  return useQuery({
    queryKey: ['interviews', { all }],
    queryFn: () => api<InterviewSummary[]>(`/interviews${all ? '?all=true' : ''}`),
  });
}

export function useInterview(id: string) {
  return useQuery({
    queryKey: ['interview', id],
    queryFn: () => api<InterviewDetail>(`/interviews/${id}`),
  });
}

export const stageLabel: Record<InterviewSummary['stage'], string> = {
  scoping: 'Understanding the process',
  happy_path: 'Main flow',
  step_detail: 'Step details',
  branches_exceptions: 'Decisions & exceptions',
  rules_controls_pain: 'Rules & pain points',
  summary: 'Summary',
  completed: 'Completed',
};
