import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, MoreHorizontal, RefreshCw, Trash2, EyeOff, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { documentCategoryLabels, type KnowledgeDocument } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DocumentStatus } from './document-status';
import { formatBytes } from './queries';

export const downloadDocument = (doc: Pick<KnowledgeDocument, 'id' | 'filename'>) =>
  downloadFile(`/documents/${doc.id}/download`, doc.filename).catch((e) =>
    toast.error(e instanceof ApiError ? e.problem.title : 'Download failed'),
  );

export function DocumentTable({
  documents,
  admin,
}: {
  documents: KnowledgeDocument[];
  admin: boolean;
}) {
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<KnowledgeDocument | null>(null);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['knowledge-documents'] }),
      queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] }),
    ]);
  const act = useMutation({
    mutationFn: ({
      doc,
      action,
    }: {
      doc: KnowledgeDocument;
      action: 'reindex' | 'toggle' | 'delete';
    }) =>
      action === 'reindex'
        ? api(`/documents/${doc.id}/reindex`, { method: 'POST' })
        : action === 'toggle'
          ? api(`/documents/${doc.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ isActive: !doc.isActive }),
            })
          : api(`/documents/${doc.id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof ApiError ? e.problem.title : 'Action failed'),
  });

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Document</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Version</TableHead>
            {admin && <TableHead>Status</TableHead>}
            <TableHead>Uploaded</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((d) => (
            <TableRow key={d.id} className={d.isActive ? '' : 'opacity-60'}>
              <TableCell>
                <div className="font-medium">{d.title}</div>
                <div className="text-muted-foreground text-xs">
                  {d.filename} · {formatBytes(d.sizeBytes)}
                </div>
              </TableCell>
              <TableCell>
                {documentCategoryLabels[d.category]}
                {d.categorySource !== 'user' && (
                  <span
                    className="text-muted-foreground ml-1 text-[10px] uppercase"
                    title={d.classificationReason ?? undefined}
                  >
                    {d.categorySource === 'ai' ? 'AI' : 'auto'}
                  </span>
                )}
                {d.needsReview && (
                  <div className="text-xs text-amber-700 dark:text-amber-400">Needs review</div>
                )}
              </TableCell>
              <TableCell>
                {d.docVersion ?? '—'}
                {d.effectiveDate && (
                  <div className="text-muted-foreground text-xs">
                    from {formatDate(d.effectiveDate)}
                  </div>
                )}
              </TableCell>
              {admin && (
                <TableCell>
                  <DocumentStatus doc={d} />
                </TableCell>
              )}
              <TableCell>
                {formatDate(d.createdAt)}
                <div className="text-muted-foreground text-xs">{d.uploadedBy.displayName}</div>
              </TableCell>
              <TableCell>
                {admin ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Actions for ${d.title}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => downloadDocument(d)}>
                        <Download /> Download
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => act.mutate({ doc: d, action: 'reindex' })}>
                        <RefreshCw /> Re-index
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => act.mutate({ doc: d, action: 'toggle' })}>
                        {d.isActive ? <EyeOff /> : <Eye />} {d.isActive ? 'Deactivate' : 'Activate'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(d)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => downloadDocument(d)}
                    aria-label={`Download ${d.title}`}
                  >
                    <Download />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{toDelete?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The file and its indexed passages are removed and the AI will stop using it. Facts
              already recorded from it keep their history. To keep the file but stop using it,
              deactivate it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => toDelete && act.mutate({ doc: toDelete, action: 'delete' })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
