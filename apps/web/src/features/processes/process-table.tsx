import { Link } from 'react-router';
import type { ProcessListItem } from '@process-ai/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { StatusBadge } from './badges';

export function ProcessTable({ items }: { items: ProcessListItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Process</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Version</TableHead>
          <TableHead className="text-right">Steps</TableHead>
          <TableHead>Last reviewed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((p) => (
          <TableRow key={p.id} className="relative">
            <TableCell className="max-w-md">
              <Link
                to={`/processes/${p.id}`}
                className="font-medium after:absolute after:inset-0 hover:underline"
              >
                {p.name}
              </Link>
              {p.category && (
                <span
                  className="text-muted-foreground ml-2 font-mono text-xs"
                  title={p.category.name}
                >
                  {p.category.code}
                </span>
              )}
              {p.description && (
                <p className="text-muted-foreground truncate text-xs">{p.description}</p>
              )}
            </TableCell>
            <TableCell>{p.owner?.displayName ?? '—'}</TableCell>
            <TableCell>
              <StatusBadge status={p.status} />
            </TableCell>
            <TableCell className="text-right tabular-nums">v{p.versionNumber}</TableCell>
            <TableCell className="text-right tabular-nums">{p.stepCount}</TableCell>
            <TableCell>{formatDate(p.lastReviewedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
