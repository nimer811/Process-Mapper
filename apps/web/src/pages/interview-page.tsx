import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { CheckCircle2, ExternalLink, Pause, TriangleAlert } from 'lucide-react';
import type { InterviewDetail } from '@process-ai/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useVersionGraph } from '@/features/processes/queries';
import { ProcessMap } from '@/features/process-map/process-map';
import { StepPanel } from '@/features/process-map/step-panel';
import { ChatMessages, Composer } from '@/features/interviews/chat';
import { useConversation } from '@/features/interviews/use-conversation';
import { stageLabel, useInterview } from '@/features/interviews/queries';
import { useMediaQuery } from '@/lib/use-media-query';

export function InterviewPage() {
  const { interviewId = '' } = useParams();
  const interview = useInterview(interviewId);
  if (interview.isError) {
    return (
      <p className="text-muted-foreground">Interview not found, or you don't have access to it.</p>
    );
  }
  if (!interview.data) return <Skeleton className="h-[75vh] w-full" />;
  return <InterviewWorkspace key={interview.data.id} interview={interview.data} />;
}

function InterviewWorkspace({ interview }: { interview: InterviewDetail }) {
  const {
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
  } = useConversation(interview);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const graph = useVersionGraph(interview.versionId);
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const openItems = interview.openItems;
  const selectedStep = graph.data?.steps.find((s) => s.id === selectedStepId) ?? null;

  const chat = (
    <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden py-0">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ChatMessages
          messages={interview.messages}
          pendingUserText={pendingUserText}
          streamingText={streamingText}
          notes={notes}
        />
      </div>
      {stage === 'summary' && isOwner && !closed && (
        <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm">
          <span>Does the summary look right? Confirm it, or type any corrections below.</span>
          <Button size="sm" onClick={complete} disabled={busy}>
            <CheckCircle2 />
            Confirm and finish
          </Button>
        </div>
      )}
      {canChat ? (
        <Composer
          disabled={busy}
          onSend={send}
          placeholder={
            busy
              ? 'The interviewer is replying…'
              : 'Type your answer… (Enter to send, Shift+Enter for a new line)'
          }
        />
      ) : (
        <div className="text-muted-foreground flex items-center gap-2 border-t px-4 py-3 text-sm">
          {closed ? (
            <>
              <CheckCircle2 className="size-4 text-emerald-600" />
              This interview is complete.
            </>
          ) : !interview.aiAvailable ? (
            <>
              <TriangleAlert className="size-4 text-amber-600" />
              The AI interviewer isn't configured yet (LLM_API_KEY).
            </>
          ) : (
            <>Read-only: only {interview.user.displayName} can continue this interview.</>
          )}
        </div>
      )}
    </Card>
  );

  const panel = (
    <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden py-0">
      <Tabs defaultValue="map" className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <TabsList>
            <TabsTrigger value="map">Live map</TabsTrigger>
            <TabsTrigger value="questions">
              Open questions{openItems.length ? ` (${openItems.length})` : ''}
            </TabsTrigger>
          </TabsList>
          <span className="text-muted-foreground hidden text-xs sm:inline">
            {graph.data?.steps.length ?? 0} steps captured
          </span>
        </div>
        <TabsContent value="map" className="min-h-0 flex-1">
          {graph.data && graph.data.steps.length > 0 ? (
            <ProcessMap
              graph={graph.data}
              selectedStepId={selectedStepId}
              onSelectStep={setSelectedStepId}
            />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center p-8 text-center text-sm">
              The process map appears here as you describe the steps.
            </div>
          )}
        </TabsContent>
        <TabsContent value="questions" className="min-h-0 flex-1 overflow-y-auto p-4">
          {openItems.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing outstanding right now.</p>
          ) : (
            <ul className="space-y-2">
              {openItems.map((i) => (
                <li key={i.id} className="flex items-start gap-2 rounded-md border p-2.5 text-sm">
                  <Badge
                    variant={i.type === 'contradiction' ? 'destructive' : 'secondary'}
                    className="shrink-0"
                  >
                    {i.type === 'missing_info'
                      ? 'Missing'
                      : i.type.charAt(0).toUpperCase() + i.type.slice(1)}
                  </Badge>
                  <span className="min-w-0 flex-1">{i.description}</span>
                  {i.status === 'asked' && (
                    <span className="text-muted-foreground shrink-0 text-xs">asked</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );

  return (
    <div className="flex h-[calc(100svh-3.5rem-3rem)] min-h-[560px] flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0">
          <nav className="text-muted-foreground text-xs">
            <Link to="/interviews" className="hover:underline">
              Interviews
            </Link>{' '}
            / {interview.departmentName}
          </nav>
          <h1 className="truncate text-xl font-semibold tracking-tight">{interview.processName}</h1>
        </div>
        <Badge variant="secondary">{stageLabel[stage]}</Badge>
        <div className="flex min-w-48 flex-1 items-center gap-2">
          <Progress value={completeness} className="max-w-56" aria-label="Completeness" />
          <span className="text-muted-foreground text-xs tabular-nums">
            {Math.round(completeness)}% complete
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/processes/${interview.processId}`}>
              <ExternalLink />
              Process page
            </Link>
          </Button>
          {isOwner && !closed && interview.status !== 'paused' && (
            <Button variant="outline" size="sm" onClick={pause} disabled={busy}>
              <Pause />
              Pause
            </Button>
          )}
        </div>
      </header>

      {/* Desktop: side by side. Mobile: tabs. Only one is rendered so chat state isn't duplicated. */}
      {isDesktop ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(380px,5fr)_7fr] gap-4">
          {chat}
          {panel}
        </div>
      ) : (
        <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col">
          <TabsList>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="map">Map & questions</TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="min-h-0 flex-1">
            {chat}
          </TabsContent>
          <TabsContent value="map" className="min-h-0 flex-1">
            {panel}
          </TabsContent>
        </Tabs>
      )}

      {graph.data && (
        <StepPanel
          graph={graph.data}
          step={selectedStep}
          onClose={() => setSelectedStepId(null)}
          onSelectStep={setSelectedStepId}
        />
      )}
    </div>
  );
}
