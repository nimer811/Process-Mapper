import { FolderSearch } from 'lucide-react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

export function EmptyProcesses({ filtered }: { filtered: boolean }) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderSearch />
        </EmptyMedia>
        <EmptyTitle>{filtered ? 'No matching processes' : 'No processes yet'}</EmptyTitle>
        <EmptyDescription>
          {filtered
            ? 'Try a different search term or status.'
            : 'Processes appear here once they are mapped with the AI interviewer.'}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
