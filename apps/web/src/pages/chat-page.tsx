import { Link, NavLink, useParams } from 'react-router';
import {
  CheckCircle2,
  LayoutDashboard,
  MessageSquarePlus,
  Pause,
  TriangleAlert,
} from 'lucide-react';
import type { InterviewDetail } from '@process-ai/shared';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { useMediaQuery } from '@/lib/use-media-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChatMessages, Composer } from '@/features/interviews/chat';
import { stageLabel, useInterview, useInterviews } from '@/features/interviews/queries';
import { StartInterviewDialog } from '@/features/interviews/start-interview-dialog';
import { useConversation } from '@/features/interviews/use-conversation';

/**
 * Proof-of-concept chat channel: a full-screen, text-only conversation surface (no map, no app
 * chrome), the way a messaging channel would feel. Uses only the channel-agnostic interview API.
 */
export function ChatPage() {
  const { interviewId } = useParams();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const showList = isDesktop || !interviewId;

  return (
    <div className="bg-background flex h-svh flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <Link to="/chat" className="flex items-center gap-2 font-semibold">
          <img src="/favicon.svg" alt="" className="size-6 rounded" />
          Process AI
          <span className="text-muted-foreground rounded border px-1.5 text-[10px] font-medium uppercase">
            Chat preview
          </span>
        </Link>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <LayoutDashboard />
            Open full app
          </Link>
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        {showList && (
          <ConversationList
            activeId={interviewId}
            className={isDesktop ? 'w-72 border-r' : 'flex-1'}
          />
        )}
        {interviewId ? (
          <ConversationLoader id={interviewId} />
        ) : (
          isDesktop && (
            <div className="text-muted-foreground flex flex-1 items-center justify-center p-8 text-center text-sm">
              Start a new conversation or pick one from the list.
            </div>
          )
        )}
      </div>
    </div>
  );
}

function ConversationList({ activeId, className }: { activeId?: string; className?: string }) {
  const interviews = useInterviews();
  return (
    <aside className={cn('flex min-h-0 flex-col', className)}>
      <div className="p-3">
        <StartInterviewDialog
          basePath="/chat"
          trigger={
            <Button className="w-full">
              <MessageSquarePlus />
              New conversation
            </Button>
          }
        />
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {interviews.isPending && <Skeleton className="mx-1 h-14" />}
        {interviews.data?.map((i) => (
          <NavLink
            key={i.id}
            to={`/chat/${i.id}`}
            className={cn(
              'hover:bg-muted block rounded-md px-3 py-2',
              i.id === activeId && 'bg-muted',
            )}
          >
            <div className="truncate text-sm font-medium">{i.processName}</div>
            <div className="text-muted-foreground flex justify-between gap-2 text-xs">
              <span className="truncate">
                {i.status === 'paused' ? 'Paused' : stageLabel[i.stage]}
              </span>
              <span className="shrink-0">{formatDate(i.lastActivityAt)}</span>
            </div>
          </NavLink>
        ))}
        {interviews.data?.length === 0 && (
          <p className="text-muted-foreground px-3 py-2 text-sm">No conversations yet.</p>
        )}
      </nav>
    </aside>
  );
}

function ConversationLoader({ id }: { id: string }) {
  const interview = useInterview(id);
  if (interview.isError)
    return <p className="text-muted-foreground p-6 text-sm">Conversation not found.</p>;
  if (!interview.data) return <Skeleton className="m-6 flex-1" />;
  return <Conversation key={interview.data.id} interview={interview.data} />;
}

function Conversation({ interview }: { interview: InterviewDetail }) {
  const c = useConversation(interview);
  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{interview.processName}</div>
          <div className="text-muted-foreground text-xs">
            {stageLabel[c.stage]} · {Math.round(c.completeness)}% complete
          </div>
        </div>
        {c.isOwner && !c.closed && interview.status !== 'paused' && (
          <Button variant="ghost" size="sm" onClick={c.pause} disabled={c.busy}>
            <Pause />
            Pause
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl">
          <ChatMessages
            messages={interview.messages}
            pendingUserText={c.pendingUserText}
            streamingText={c.streamingText}
            notes={c.notes}
          />
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl">
        {c.stage === 'summary' && c.isOwner && !c.closed && (
          <div className="bg-muted/50 mx-3 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
            <span>Does the summary look right? Confirm, or type corrections.</span>
            <Button size="sm" onClick={c.complete} disabled={c.busy}>
              <CheckCircle2 />
              Confirm and finish
            </Button>
          </div>
        )}
        {c.canChat ? (
          <Composer
            disabled={c.busy}
            onSend={c.send}
            placeholder={c.busy ? 'Replying…' : 'Message Process AI'}
          />
        ) : (
          <div className="text-muted-foreground flex items-center gap-2 border-t px-4 py-3 text-sm">
            {c.closed ? (
              <>
                <CheckCircle2 className="size-4 text-emerald-600" />
                Complete.{' '}
                <Link to={`/processes/${interview.processId}`} className="underline">
                  View the process
                </Link>
              </>
            ) : !interview.aiAvailable ? (
              <>
                <TriangleAlert className="size-4 text-amber-600" />
                The AI interviewer isn't configured yet.
              </>
            ) : (
              <>Read-only conversation.</>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
