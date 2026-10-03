import { CheckCircle2, CircleAlert, Loader2 } from 'lucide-react';
import type { KnowledgeDocument } from '@process-ai/shared';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function DocumentStatus({ doc }: { doc: KnowledgeDocument }) {
  if (!doc.isActive) return <Badge variant="outline">Inactive</Badge>;
  switch (doc.status) {
    case 'ready':
      return (
        <Badge
          variant="secondary"
          className="gap-1 bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
        >
          <CheckCircle2 className="size-3" />
          Ready · {doc.chunkCount} passages
        </Badge>
      );
    case 'failed':
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="destructive" className="cursor-help gap-1">
              <CircleAlert className="size-3" />
              Failed
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{doc.error ?? 'Indexing failed'}</TooltipContent>
        </Tooltip>
      );
    default:
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="size-3 animate-spin" />
          {doc.status === 'pending' ? 'Queued' : 'Indexing'}
        </Badge>
      );
  }
}
