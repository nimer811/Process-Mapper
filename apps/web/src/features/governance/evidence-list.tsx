import { Link } from 'react-router';
import { Bot, FileText, MessageSquareQuote, PencilLine, UserCheck } from 'lucide-react';
import type { EvidenceItem } from '@process-ai/shared';
import { formatDate } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadDocument } from '@/features/knowledge/document-table';
import { useEvidence } from './queries';

const source = {
  user_statement: { icon: MessageSquareQuote, label: 'Said in an interview' },
  document: { icon: FileText, label: 'From a document' },
  ai_inference: { icon: Bot, label: 'Inferred by the AI' },
  user_validation: { icon: UserCheck, label: 'Confirmed' },
  manual_edit: { icon: PencilLine, label: 'Edited' },
} as const;

/** "Where did this come from?" — every recorded source for one step, rule or connection. */
export function EvidenceList({ versionId, entityId }: { versionId: string; entityId: string }) {
  const evidence = useEvidence(versionId, entityId);
  if (evidence.isPending) return <Skeleton className="h-12" />;
  if (!evidence.data?.length)
    return <p className="text-muted-foreground text-sm">No source recorded.</p>;
  return (
    <ol className="space-y-2.5">
      {evidence.data.map((e: EvidenceItem) => {
        const meta = source[e.sourceType];
        return (
          <li key={e.id} className="flex gap-2.5 text-sm">
            <meta.icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <div>
                {meta.label}
                {e.providedBy && <> by {e.providedBy.displayName}</>}
                <span className="text-muted-foreground"> · {formatDate(e.createdAt)}</span>
                {e.field && e.sourceType !== 'user_statement' && (
                  <span className="text-muted-foreground"> · {e.field.replaceAll(',', ', ')}</span>
                )}
              </div>
              {e.quote && (
                <blockquote className="text-muted-foreground mt-0.5 border-l-2 pl-2 italic">
                  “{e.quote}”
                </blockquote>
              )}
              {!e.quote && e.messageExcerpt && e.sourceType === 'ai_inference' && (
                <p className="text-muted-foreground mt-0.5 text-xs">
                  While discussing: “{e.messageExcerpt}”
                </p>
              )}
              {e.document && (
                <button
                  type="button"
                  onClick={() =>
                    downloadDocument({ id: e.document!.id, filename: e.document!.citation })
                  }
                  className="mt-0.5 text-xs underline"
                >
                  {e.document.citation}
                </button>
              )}
              {e.interviewId && (
                <Link
                  to={`/interviews/${e.interviewId}`}
                  className="text-muted-foreground mt-0.5 block text-xs underline"
                >
                  Open the interview
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
