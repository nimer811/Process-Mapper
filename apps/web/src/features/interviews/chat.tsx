import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, Bot, FileText, Sparkles } from 'lucide-react';
import { downloadDocument } from '@/features/knowledge/document-table';
import type { InterviewMessage } from '@process-ai/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export interface ChatTurnNote {
  /** Changes the interviewer recorded from the user's message (shown under it). */
  changes: string[];
}

export function ChatMessages({
  messages,
  pendingUserText,
  streamingText,
  notes,
}: {
  messages: InterviewMessage[];
  pendingUserText: string | null;
  streamingText: string | null;
  notes: Record<string, ChatTurnNote>;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, pendingUserText, streamingText]);

  return (
    <div className="space-y-4 p-4">
      {messages.map((m) => (
        <div key={m.id}>
          <Bubble role={m.role} content={m.content} />
          {m.citations.length > 0 && <Citations citations={m.citations} />}
          {notes[m.id] && <Captured changes={notes[m.id]!.changes} />}
        </div>
      ))}
      {pendingUserText && <Bubble role="user" content={pendingUserText} />}
      {streamingText !== null && (
        <Bubble role="assistant" content={streamingText} typing={streamingText.length === 0} />
      )}
      <div ref={endRef} />
    </div>
  );
}

function Bubble({
  role,
  content,
  typing,
}: {
  role: 'user' | 'assistant';
  content: string;
  typing?: boolean;
}) {
  const isUser = role === 'user';
  return (
    <div className={cn('flex gap-2.5', isUser && 'justify-end')}>
      {!isUser && (
        <div className="bg-primary text-primary-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full">
          <Bot className="size-4" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
          isUser ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-tl-sm',
        )}
      >
        {typing ? <TypingDots /> : content}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex gap-1 py-1" aria-label="Interviewer is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="bg-muted-foreground/60 size-1.5 animate-bounce rounded-full"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}

function Citations({ citations }: { citations: InterviewMessage['citations'] }) {
  return (
    <div className="mt-1.5 ml-9.5 flex flex-wrap gap-1.5">
      {citations.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={() => downloadDocument({ id: c.documentId, filename: c.label })}
          className="bg-background hover:bg-muted text-muted-foreground flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]"
          title="Open the source document"
        >
          <FileText className="size-3" />
          {c.label}
        </button>
      ))}
    </div>
  );
}

function Captured({ changes }: { changes: string[] }) {
  if (!changes.length) return null;
  return (
    <div className="mt-1.5 flex justify-end">
      <div className="text-muted-foreground flex max-w-[85%] flex-wrap justify-end gap-1 text-[11px]">
        <Sparkles className="mt-0.5 size-3 shrink-0" />
        {changes.slice(0, 6).map((c) => (
          <span key={c} className="bg-background rounded border px-1.5 py-0.5">
            {c}
          </span>
        ))}
        {changes.length > 6 && <span>+{changes.length - 6} more</span>}
      </div>
    </div>
  );
}

export function Composer({
  disabled,
  placeholder,
  onSend,
}: {
  disabled: boolean;
  placeholder: string;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const send = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };
  return (
    <div className="flex items-end gap-2 border-t p-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={2}
        className="max-h-40 min-h-11 resize-none"
        aria-label="Your answer"
      />
      <Button size="icon" onClick={send} disabled={disabled || !text.trim()} aria-label="Send">
        <ArrowUp />
      </Button>
    </div>
  );
}
