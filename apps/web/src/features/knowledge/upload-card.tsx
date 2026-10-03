import { useRef, useState, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEV_USER_HEADER,
  documentCategories,
  documentCategoryLabels,
  type DocumentCategory,
} from '@process-ai/shared';
import { getDevUserId } from '@/auth/dev-session';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ACCEPT = '.pdf,.docx,.xlsx,.txt,.md';

/** Upload one or more files with shared metadata; each is indexed in the background. */
export function UploadCard({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState<DocumentCategory | 'auto'>('auto');
  const [docVersion, setDocVersion] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    setFiles(Array.from(e.dataTransfer.files));
  };

  const upload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    let ok = 0;
    for (const file of files) {
      const form = new FormData();
      if (category !== 'auto') form.set('category', category);
      if (docVersion) form.set('docVersion', docVersion);
      if (effectiveDate) form.set('effectiveDate', effectiveDate);
      form.set('file', file);
      const headers = new Headers();
      const devUserId = getDevUserId();
      if (devUserId) headers.set(DEV_USER_HEADER, devUserId);
      const res = await fetch(`/api/v1/knowledge-bases/${knowledgeBaseId}/documents`, {
        method: 'POST',
        body: form,
        headers,
      });
      if (res.ok) ok++;
      else {
        const problem = await res.json().catch(() => ({ title: res.statusText }));
        toast.error(`${file.name}: ${problem.title}`);
      }
    }
    setUploading(false);
    if (ok)
      toast.success(`${ok} document${ok === 1 ? '' : 's'} uploaded — indexing in the background`);
    setFiles([]);
    if (inputRef.current) inputRef.current.value = '';
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['knowledge-documents', knowledgeBaseId] }),
      queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] }),
    ]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Upload documents</CardTitle>
        <CardDescription>
          PDF, Word (.docx), Excel (.xlsx) or text, up to 25 MB each. Scanned PDFs without text
          aren't supported yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'text-muted-foreground flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-sm transition-colors',
            dragging ? 'border-primary bg-muted' : 'hover:bg-muted/50',
          )}
        >
          <FileUp className="size-6" />
          {files.length ? (
            <span className="text-foreground font-medium">
              {files.map((f) => f.name).join(', ')}
            </span>
          ) : (
            <span>Drop files here or click to choose</span>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          aria-label="Choose files"
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 grid gap-1.5">
            <Label htmlFor="doc-category">Category</Label>
            <Select value={category} onValueChange={(v) => v && setCategory(v as DocumentCategory)}>
              <SelectTrigger id="doc-category" className="w-full">
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect (AI)</SelectItem>
                {documentCategories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {documentCategoryLabels[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="doc-version">Version (optional)</Label>
            <Input
              id="doc-version"
              placeholder="e.g. 3.1"
              value={docVersion}
              onChange={(e) => setDocVersion(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="doc-effective">Effective date (optional)</Label>
            <Input
              id="doc-effective"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={upload} disabled={uploading || files.length === 0}>
            {uploading ? <Loader2 className="animate-spin" /> : <FileUp />}
            {uploading ? 'Uploading…' : `Upload${files.length > 1 ? ` ${files.length} files` : ''}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
