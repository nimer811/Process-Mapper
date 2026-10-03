import { FileText } from 'lucide-react';
import { documentCategoryLabels } from '@process-ai/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { downloadDocument } from './document-table';
import { useProcessDocuments } from './queries';

/** Documents tab on a process page: linked documents first, then the department's knowledge base. */
export function ProcessDocuments({ processId }: { processId: string }) {
  const docs = useProcessDocuments(processId);
  if (docs.isPending) return <Skeleton className="h-24 w-full" />;
  if (!docs.data?.length) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText />
          </EmptyMedia>
          <EmptyTitle>No documents</EmptyTitle>
          <EmptyDescription>
            SOPs and policies uploaded to this department's knowledge base appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Card className="py-0">
      <CardContent className="px-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Relation</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.data.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.title}</TableCell>
                <TableCell>{documentCategoryLabels[d.category]}</TableCell>
                <TableCell>
                  {d.docVersion ?? '—'}
                  {d.effectiveDate && (
                    <div className="text-muted-foreground text-xs">
                      from {formatDate(d.effectiveDate)}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {d.processId === processId ? 'Linked to this process' : 'Department reference'}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => downloadDocument(d)}
                    aria-label={`Download ${d.title}`}
                  >
                    <FileText />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
