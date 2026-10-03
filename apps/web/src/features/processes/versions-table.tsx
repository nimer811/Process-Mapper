import type { VersionSummary } from '@process-ai/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import { StatusBadge } from './badges';

export function VersionsTable({
  versions,
  activeVersionId,
  onOpen,
}: {
  versions: VersionSummary[];
  activeVersionId: string;
  onOpen: (id: string) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Version</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Change</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Validated</TableHead>
          <TableHead>Approved</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {versions.map((v) => (
          <TableRow key={v.id}>
            <TableCell className="font-medium tabular-nums">v{v.versionNumber}</TableCell>
            <TableCell>
              <StatusBadge status={v.status} />
            </TableCell>
            <TableCell className="max-w-xs truncate">{v.changeSummary ?? '—'}</TableCell>
            <TableCell>
              {formatDate(v.createdAt)}
              <div className="text-muted-foreground text-xs">{v.createdBy?.displayName}</div>
            </TableCell>
            <TableCell>
              {formatDate(v.validatedAt)}
              <div className="text-muted-foreground text-xs">{v.validatedBy?.displayName}</div>
            </TableCell>
            <TableCell>
              {formatDate(v.approvedAt)}
              <div className="text-muted-foreground text-xs">{v.approvedBy?.displayName}</div>
            </TableCell>
            <TableCell className="text-right">
              {v.id === activeVersionId ? (
                <span className="text-muted-foreground text-xs">Viewing</span>
              ) : (
                <Button variant="outline" size="sm" onClick={() => onOpen(v.id)}>
                  Open
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
