import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { InterviewDetail, InterviewMessage } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/auth/auth';
import type { ChatTurnNote } from './chat';
import { sendInterviewMessage } from './stream';

/**
 * Conversation state and actions for one interview, shared by every chat surface
 * (the interview workspace and the proof-of-concept /chat interface).
 */
export function useConversation(interview: InterviewDetail) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [live, setLive] = useState<{
    stage: InterviewDetail['stage'];
    completeness: number;
  } | null>(null);
  const [notes, setNotes] = useState<Record<string, ChatTurnNote>>({});
  const resumed = useRef(false);

  const isOwner = user?.id === interview.user.id;
  const stage = live?.stage ?? interview.stage;
  const completeness = live?.completeness ?? interview.completeness ?? 0;
  const busy = pendingUserText !== null;
  const closed = interview.status === 'completed' || stage === 'completed';
  const canChat = isOwner && interview.aiAvailable && !closed;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['interview', interview.id] }),
      queryClient.invalidateQueries({ queryKey: ['version', interview.versionId] }),
      queryClient.invalidateQueries({ queryKey: ['interviews'] }),
    ]);

  // Opening a paused interview resumes it with a short recap.
  useEffect(() => {
    if (resumed.current || !isOwner || !interview.aiAvailable || interview.status !== 'paused')
      return;
    resumed.current = true;
    api<InterviewMessage>(`/interviews/${interview.id}/resume`, { method: 'POST' })
      .then(refresh)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interview.id, interview.status, isOwner, interview.aiAvailable]);

  const send = async (text: string) => {
    setPendingUserText(text);
    setStreamingText('');
    let changes: string[] = [];
    try {
      for await (const event of sendInterviewMessage(interview.id, text)) {
        if (event.type === 'state') {
          changes = event.changes;
          setLive({ stage: event.stage, completeness: event.completeness });
          void queryClient.invalidateQueries({ queryKey: ['version', interview.versionId] });
        } else if (event.type === 'token') {
          setStreamingText((t) => (t ?? '') + event.text);
        } else if (event.type === 'message') {
          await queryClient.invalidateQueries({ queryKey: ['interview', interview.id] });
          const fresh = queryClient.getQueryData<InterviewDetail>(['interview', interview.id]);
          const userMsg = [...(fresh?.messages ?? [])].reverse().find((m) => m.role === 'user');
          if (userMsg && changes.length) setNotes((n) => ({ ...n, [userMsg.id]: { changes } }));
        } else if (event.type === 'error') {
          toast.error(event.message);
        }
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Message could not be sent');
    } finally {
      setPendingUserText(null);
      setStreamingText(null);
      void refresh();
    }
  };

  const pause = async () => {
    await api(`/interviews/${interview.id}/pause`, { method: 'POST' });
    await refresh();
    toast.success('Paused. Everything is saved — continue any time.');
  };

  const complete = async () => {
    try {
      await api(`/interviews/${interview.id}/complete`, { method: 'POST' });
      await refresh();
      toast.success('Done. The draft process is in the Process Library.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Could not complete the interview');
    }
  };

  return {
    isOwner,
    stage,
    completeness,
    busy,
    closed,
    canChat,
    pendingUserText,
    streamingText,
    notes,
    send,
    pause,
    complete,
  };
}
