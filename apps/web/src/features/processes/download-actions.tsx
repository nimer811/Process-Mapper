import { useState } from 'react';
import { Download, FileImage, FileText, FolderDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadFile } from '@/lib/download';
import { ApiError } from '@/lib/api';

function useDownload() {
  const [busy, setBusy] = useState(false);
  const run = async (path: string, fallbackName: string, label: string) => {
    setBusy(true);
    const id = toast.loading(`Preparing ${label}…`);
    try {
      await downloadFile(path, fallbackName);
      toast.success(`${label.charAt(0).toUpperCase()}${label.slice(1)} downloaded`, { id });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : `Couldn't download ${label}`, { id });
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** Per-version downloads: the full process pack (PDF) or just the map (SVG). */
export function ProcessDownloadMenu({ versionId, slug }: { versionId: string; slug: string }) {
  const { busy, run } = useDownload();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Download />}
          Download
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem
          onSelect={() =>
            run(`/versions/${versionId}/pack.pdf`, `${slug}-process-pack.pdf`, 'process pack')
          }
        >
          <FileText />
          <div className="grid">
            <span>Process pack (PDF)</span>
            <span className="text-muted-foreground text-xs">
              Overview, map, steps, rules, history
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => run(`/versions/${versionId}/map.svg`, `${slug}-map.svg`, 'process map')}
        >
          <FileImage />
          <div className="grid">
            <span>Process map (SVG)</span>
            <span className="text-muted-foreground text-xs">
              Full-size diagram for slides or Visio
            </span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Bulk download: every process in the department the user can see, as a ZIP. */
export function DepartmentPackButton({
  departmentSlug,
  size = 'default',
}: {
  departmentSlug: string;
  size?: 'default' | 'sm';
}) {
  const { busy, run } = useDownload();
  return (
    <Button
      variant="outline"
      size={size}
      disabled={busy}
      onClick={() =>
        run(
          `/departments/${departmentSlug}/pack.zip`,
          `${departmentSlug}-process-pack.zip`,
          'department pack',
        )
      }
    >
      {busy ? <Loader2 className="animate-spin" /> : <FolderDown />}
      Download department pack
    </Button>
  );
}
