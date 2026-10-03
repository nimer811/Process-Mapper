import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { documentCategoryLabels, type KnowledgeSearchResult } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

/** Admin tool: see exactly which passages the interviewer would retrieve for a question. */
export function SearchCard({ departmentId }: { departmentId: string | null }) {
  const [query, setQuery] = useState('');
  const search = useMutation({
    mutationFn: (q: string) =>
      api<KnowledgeSearchResult[]>('/knowledge/search', {
        method: 'POST',
        body: JSON.stringify({ query: q, departmentId }),
      }),
    onError: (e) => toast.error(e instanceof ApiError ? e.problem.title : 'Search failed'),
  });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) search.mutate(query.trim());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Test search</CardTitle>
        <CardDescription>
          Check what the AI interviewer finds for a question, e.g. "who approves purchases above AED
          50,000?"
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about a rule, threshold or step…"
          />
          <Button type="submit" variant="outline" disabled={search.isPending}>
            <Search />
            Search
          </Button>
        </form>
        {search.data && search.data.length === 0 && (
          <p className="text-muted-foreground text-sm">No matching passages.</p>
        )}
        {search.data?.map((r, i) => (
          <div key={r.chunkId} className="rounded-md border p-3 text-sm">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs tabular-nums">#{i + 1}</span>
              <span className="font-medium">{r.citation}</span>
              <Badge variant="secondary">{documentCategoryLabels[r.category]}</Badge>
            </div>
            <p className="text-muted-foreground line-clamp-4 whitespace-pre-wrap">{r.content}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
