import { Search } from 'lucide-react';
import { versionStatuses, type VersionStatus } from '@process-ai/shared';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { humanize } from '@/lib/format';

const ALL = 'all';

export function ProcessFilters({
  q,
  status,
  onChange,
}: {
  q: string;
  status: VersionStatus | undefined;
  onChange: (next: { q?: string; status?: VersionStatus | undefined }) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <div className="relative w-full max-w-sm">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          type="search"
          placeholder="Search processes and steps…"
          className="pl-8"
          value={q}
          onChange={(e) => onChange({ q: e.target.value })}
        />
      </div>
      <Select
        value={status ?? ALL}
        onValueChange={(v) => onChange({ status: v === ALL ? undefined : (v as VersionStatus) })}
      >
        <SelectTrigger className="w-44" aria-label="Status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {versionStatuses
            .filter((s) => s !== 'archived')
            .map((s) => (
              <SelectItem key={s} value={s}>
                {humanize(s)}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}
