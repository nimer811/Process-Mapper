import { useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { FileText, Lightbulb, TriangleAlert } from 'lucide-react';
import type { ProcessDetail, VersionGraph } from '@process-ai/shared';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { formatDate, humanize } from '@/lib/format';
import { useProcess, useVersionGraph } from '@/features/processes/queries';
import { StatusBadge } from '@/features/processes/badges';
import { ProcessMap } from '@/features/process-map/process-map';
import { StepPanel } from '@/features/process-map/step-panel';
import { StepTable, RulesList } from '@/features/processes/process-details';
import { VersionsTable } from '@/features/processes/versions-table';
import { ProcessDownloadMenu } from '@/features/processes/download-actions';

export function ProcessPage() {
  const { processId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const process = useProcess(processId);
  const versionId = params.get('version') ?? process.data?.defaultVersionId;
  const graph = useVersionGraph(versionId);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  if (process.isError) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Process not found</EmptyTitle>
          <EmptyDescription>
            It may not exist, or you may not have access to its draft.{' '}
            <Link to="/library" className="underline">
              Back to the library
            </Link>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (!process.data || !graph.data) return <Skeleton className="h-[70vh] w-full" />;

  const p = process.data;
  const g = graph.data;
  const selectedStep = g.steps.find((s) => s.id === selectedStepId) ?? null;

  return (
    <>
      <ProcessHeader
        process={p}
        graph={g}
        onVersionChange={(id) => {
          setSelectedStepId(null);
          setParams(id === p.defaultVersionId ? {} : { version: id }, { replace: true });
        }}
      />

      <Tabs defaultValue="map" className="mt-6">
        <TabsList>
          <TabsTrigger value="map">Process map</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
        </TabsList>

        <TabsContent value="map">
          <Card className="h-[70vh] min-h-[480px] overflow-hidden py-0">
            <ProcessMap graph={g} selectedStepId={selectedStepId} onSelectStep={setSelectedStepId} />
          </Card>
        </TabsContent>

        <TabsContent value="details" className="space-y-6">
          <Card className="py-0">
            <CardContent className="px-2">
              <StepTable graph={g} onSelectStep={setSelectedStepId} />
            </CardContent>
          </Card>
          <RulesList graph={g} />
        </TabsContent>

        <TabsContent value="issues">
          <Placeholder
            icon={<TriangleAlert />}
            title="Issues"
            text={`${g.steps.reduce((n, s) => n + s.painPoints.length, 0)} pain points are recorded on steps (see the map). Structured issue analysis arrives in Phase 5.`}
          />
        </TabsContent>
        <TabsContent value="automation">
          <Placeholder
            icon={<Lightbulb />}
            title="Automation opportunities"
            text="Identified from the validated process in Phase 5. Kept separate from the current-state process."
          />
        </TabsContent>
        <TabsContent value="documents">
          <Placeholder
            icon={<FileText />}
            title="Documents"
            text="SOPs and policies linked to this process appear here once the knowledge base is built (Phase 3)."
          />
        </TabsContent>
        <TabsContent value="versions">
          <Card className="py-0">
            <CardContent className="px-2">
              <VersionsTable
                versions={p.versions}
                activeVersionId={g.id}
                onOpen={(id) => setParams(id === p.defaultVersionId ? {} : { version: id })}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <StepPanel
        graph={g}
        step={selectedStep}
        onClose={() => setSelectedStepId(null)}
        onSelectStep={setSelectedStepId}
      />
    </>
  );
}

function ProcessHeader({
  process: p,
  graph: g,
  onVersionChange,
}: {
  process: ProcessDetail;
  graph: VersionGraph;
  onVersionChange: (id: string) => void;
}) {
  const lastReviewed = g.approvedAt ?? g.validatedAt;
  return (
    <header>
      <nav className="text-muted-foreground mb-2 text-sm">
        <Link to="/library" className="hover:underline">
          Process Library
        </Link>{' '}
        /{' '}
        <Link to={`/library/${p.department.slug}`} className="hover:underline">
          {p.department.name}
        </Link>
      </nav>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
        <StatusBadge status={g.status} />
        {g.kind === 'to_be' && <span className="text-muted-foreground text-sm">To-Be</span>}
        <div className="ml-auto">
          <ProcessDownloadMenu versionId={g.id} slug={p.slug} />
        </div>
      </div>
      {g.description && <p className="text-muted-foreground mt-1 max-w-3xl">{g.description}</p>}

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <Meta label="Department">{p.department.name}</Meta>
        <Meta label="Process owner">{p.owner?.displayName ?? 'Unassigned'}</Meta>
        <Meta label="Version">
          {p.versions.length > 1 ? (
            <Select value={g.id} onValueChange={onVersionChange}>
              <SelectTrigger size="sm" className="h-7 w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {p.versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    v{v.versionNumber} · {humanize(v.status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            `v${g.versionNumber}`
          )}
        </Meta>
        <Meta label="Last reviewed">{formatDate(lastReviewed)}</Meta>
      </dl>

      <Card className="mt-4 py-4">
        <CardContent className="grid gap-4 text-sm md:grid-cols-3">
          <Meta label="Purpose">{g.purpose}</Meta>
          <Meta label="Trigger">{g.trigger}</Meta>
          <Meta label="End condition">{g.endCondition}</Meta>
        </CardContent>
      </Card>
    </header>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className="mt-0.5">{children || '—'}</dd>
    </div>
  );
}

function Placeholder({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{text}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
