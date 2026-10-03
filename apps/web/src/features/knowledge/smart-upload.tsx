import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FileUp, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEV_USER_HEADER,
  documentCategories,
  documentCategoryLabels,
  type BulkUploadResult,
  type DocumentCategory,
  type KnowledgeBase,
  type KnowledgeDocument,
} from '@process-ai/shared';
import { getDevUserId } from '@/auth/dev-session';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DocumentStatus } from './document-status';

const ACCEPT = '.pdf,.docx,.xlsx,.txt,.md';

/** Drop many files; the AI files each into the right knowledge base and category while indexing. */
export function SmartUploadCard() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [rejected, setRejected] = useState<BulkUploadResult['rejected']>([]);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    setRejected([]);
    const form = new FormData();
    for (const f of files) form.append('file', f);
    const headers = new Headers();
    const devUserId = getDevUserId();
    if (devUserId) headers.set(DEV_USER_HEADER, devUserId);
    try {
      const res = await fetch('/api/v1/documents/bulk', { method: 'POST', body: form, headers });
      if (!res.ok)
        throw new ApiError(
          await res
            .json()
            .catch(() => ({ title: res.statusText, status: res.status, type: 'about:blank' })),
        );
      const result = (await res.json()) as BulkUploadResult;
      setRejected(result.rejected);
      if (result.created.length)
        toast.success(
          `${result.created.length} file${result.created.length === 1 ? '' : 's'} uploaded — sorting and indexing`,
        );
      await Promise.all(
        ['documents-inbox', 'knowledge-bases', 'knowledge-documents'].map((k) =>
          qc.invalidateQueries({ queryKey: [k] }),
        ),
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void upload(Array.from(e.dataTransfer.files));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" />
          Smart upload
        </CardTitle>
        <CardDescription>
          Drop any number of SOPs, policies, approval matrices or forms. The AI reads each one,
          files it into the right knowledge base and category, picks up its title, version and
          effective date, and indexes it. Anything it isn't sure about waits below for you to check.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'text-muted-foreground flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-sm transition-colors',
            dragging ? 'border-primary bg-muted' : 'hover:bg-muted/50',
          )}
        >
          {uploading ? <Loader2 className="size-6 animate-spin" /> : <FileUp className="size-6" />}
          <span className="text-foreground font-medium">
            {uploading ? 'Uploading…' : 'Drop files here or click to choose'}
          </span>
          <span>PDF, Word, Excel or text · up to 25 MB each · up to 50 files at once</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          aria-label="Choose files for smart upload"
          onChange={(e) => void upload(Array.from(e.target.files ?? []))}
        />
        {rejected.length > 0 && (
          <ul className="text-destructive space-y-1 text-sm">
            {rejected.map((r) => (
              <li key={r.filename}>
                <span className="font-medium">{r.filename}</span>: {r.reason}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Uploads being sorted, plus anything the AI wasn't sure about. Polls while work is in progress. */
export function DocumentInbox({ knowledgeBases }: { knowledgeBases: KnowledgeBase[] }) {
  const inbox = useQuery({
    queryKey: ['documents-inbox'],
    queryFn: () => api<KnowledgeDocument[]>('/documents/inbox'),
    refetchInterval: (q) =>
      q.state.data?.some((d) => d.status === 'pending' || d.status === 'processing') ? 2000 : false,
  });
  const qc = useQueryClient();
  const workingCount =
    inbox.data?.filter((d) => d.status === 'pending' || d.status === 'processing').length ?? 0;
  const previous = useRef(workingCount);
  // When files finish sorting, the knowledge-base counts and lists change.
  useEffect(() => {
    if (workingCount < previous.current) {
      void qc.invalidateQueries({ queryKey: ['knowledge-bases'] });
      void qc.invalidateQueries({ queryKey: ['knowledge-documents'] });
    }
    previous.current = workingCount;
  }, [workingCount, qc]);

  if (!inbox.data?.length) return null;
  const sorting = inbox.data.filter((d) => d.status === 'pending' || d.status === 'processing');
  const review = inbox.data.filter((d) => !sorting.includes(d));

  return (
    <Card className="border-amber-300 dark:border-amber-900">
      <CardHeader>
        <CardTitle className="text-base">Inbox</CardTitle>
        <CardDescription>
          {sorting.length > 0 && `${sorting.length} being sorted and indexed. `}
          {review.length > 0 &&
            `${review.length} need${review.length === 1 ? 's' : ''} your check — confirm or correct where the AI filed it.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        {inbox.data.map((d) => (
          <InboxRow key={d.id} doc={d} knowledgeBases={knowledgeBases} />
        ))}
      </CardContent>
    </Card>
  );
}

function InboxRow({
  doc: d,
  knowledgeBases,
}: {
  doc: KnowledgeDocument;
  knowledgeBases: KnowledgeBase[];
}) {
  const qc = useQueryClient();
  const [kb, setKb] = useState(d.knowledgeBaseId ?? '');
  const [category, setCategory] = useState<DocumentCategory>(d.category);
  const [busy, setBusy] = useState(false);
  const working = d.status === 'pending' || d.status === 'processing';

  const confirm = async () => {
    setBusy(true);
    try {
      const changed = category !== d.category ? { category } : {};
      await api(`/documents/${d.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...changed,
          ...(kb !== d.knowledgeBaseId ? { knowledgeBaseId: kb } : {}),
          reviewed: true,
        }),
      });
      await Promise.all(
        ['documents-inbox', 'knowledge-bases', 'knowledge-documents'].map((k) =>
          qc.invalidateQueries({ queryKey: [k] }),
        ),
      );
      toast.success(`${d.title} filed`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Could not file the document');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 py-3 text-sm">
      <div className="min-w-48 flex-1">
        <div className="font-medium">{d.title}</div>
        <div className="text-muted-foreground text-xs">
          {d.filename}
          {d.classificationReason && !working && (
            <>
              {' '}
              · {d.classificationReason}
              {d.classificationConfidence !== null &&
                ` (${Math.round(d.classificationConfidence * 100)}% sure)`}
            </>
          )}
        </div>
      </div>
      {working ? (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="size-3 animate-spin" />
          {d.status === 'pending' ? 'Queued' : 'Sorting & indexing'}
        </Badge>
      ) : (
        <>
          <DocumentStatus doc={d} />
          <Select value={kb} onValueChange={(v) => v && setKb(v)}>
            <SelectTrigger size="sm" className="w-44" aria-label={`Knowledge base for ${d.title}`}>
              <SelectValue placeholder="Choose knowledge base" />
            </SelectTrigger>
            <SelectContent>
              {knowledgeBases.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(v) => v && setCategory(v as DocumentCategory)}>
            <SelectTrigger size="sm" className="w-44" aria-label={`Category for ${d.title}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {documentCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {documentCategoryLabels[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={confirm} disabled={busy || !kb}>
            <Check />
            Confirm
          </Button>
        </>
      )}
    </div>
  );
}
