import { useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { ProcessDetail, ProcessStep, Readiness, VersionGraph } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/auth/auth';
import { Button } from '@/components/ui/button';
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { formatDate, humanize } from '@/lib/format';
import { useProcess, useVersionGraph } from '@/features/processes/queries';
import { StatusBadge } from '@/features/processes/badges';
import { ProcessMap } from '@/features/process-map/process-map';
import { StepPanel } from '@/features/process-map/step-panel';
import { StepTable, RulesList } from '@/features/processes/process-details';
import { VersionsTable } from '@/features/processes/versions-table';
import { ProcessDownloadMenu } from '@/features/processes/download-actions';
import { ProcessDocuments } from '@/features/knowledge/process-documents';
import { GovernanceBar } from '@/features/governance/governance-bar';
import { OwnerSelect } from '@/features/governance/owner-select';
import { ReviewPanel } from '@/features/governance/review-panel';
import { ContributorsCard } from '@/features/contributions/contributors-card';
import { StepDialog } from '@/features/governance/step-dialog';
import { ConnectionsEditor, RulesEditor } from '@/features/governance/structure-editors';
import { MetadataDialog } from '@/features/governance/metadata-dialog';
import { VersionsPanel } from '@/features/governance/versions-panel';
import { useReadiness, useRefreshProcess } from '@/features/governance/queries';
import { findingCounts, useFindings } from '@/features/analysis/queries';
import { IssuesTab, OpportunitiesTab } from '@/features/analysis/findings-tabs';
import { DesignToBeButton } from '@/features/design/to-be-dialog';
import { ChangesPanel } from '@/features/design/changes-panel';

export function ProcessPage() {
  const { processId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const process = useProcess(processId);
  const versionId = params.get('version') ?? process.data?.defaultVersionId;
  const graph = useVersionGraph(versionId);
  const readiness = useReadiness(versionId);
  const findings = useFindings(versionId);
  const refresh = useRefreshProcess();
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [editingRequested, setEditing] = useState(false);
  const [stepDialog, setStepDialog] = useState<{ open: boolean; step: ProcessStep | null }>({
    open: false,
    step: null,
  });
  const [metaOpen, setMetaOpen] = useState(false);

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
  if (!process.data || !graph.data || !readiness.data)
    return <Skeleton className="h-[70vh] w-full" />;

  const p = process.data;
  const g = graph.data;
  const r = readiness.data;
  const editing = editingRequested && r.canEdit;
  const selectedStep = g.steps.find((s) => s.id === selectedStepId) ?? null;

  const deleteStep = async (step: ProcessStep) => {
    if (!window.confirm(`Remove ${step.stepKey} "${step.name}" and its connections?`)) return;
    try {
      await api(`/versions/${g.id}/steps/${step.id}`, { method: 'DELETE' });
      await refresh();
      toast.success('Step removed');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Could not remove the step');
    }
  };

  return (
    <>
      <ProcessHeader
        process={p}
        graph={g}
        readiness={r}
        editing={editing}
        onToggleEdit={() => setEditing((e) => !e)}
        onEditDetails={() => setMetaOpen(true)}
        onVersionChange={(id) => {
          setSelectedStepId(null);
          setEditing(false);
          setParams(id === p.defaultVersionId ? {} : { version: id }, { replace: true });
        }}
      />

      <div className="mt-4">
        <ReviewPanel graph={g} readiness={r} />
      </div>
      {g.kind === 'as_is' && (
        <div className="mt-4">
          <ContributorsCard graph={g} readiness={r} />
        </div>
      )}

      {g.kind === 'to_be' && (
        <p className="mt-4 rounded-md bg-violet-50 px-3 py-2 text-sm text-violet-900 dark:bg-violet-950 dark:text-violet-100">
          This is a proposed future state, not the current process. The documented As-Is remains in
          force. AI-designed changes are marked "AI inferred" until someone confirms them.
        </p>
      )}

      <Tabs key={g.id} defaultValue={g.kind === 'to_be' ? 'changes' : 'map'} className="mt-6">
        <TabsList>
          {g.kind === 'to_be' && <TabsTrigger value="changes">As-Is vs To-Be</TabsTrigger>}
          <TabsTrigger value="map">Process map</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
        </TabsList>

        {g.kind === 'to_be' && (
          <TabsContent value="changes">
            <ChangesPanel graph={g} onSelectStep={setSelectedStepId} />
          </TabsContent>
        )}
        <TabsContent value="map">
          <Card className="h-[70vh] min-h-[480px] overflow-hidden py-0">
            <ProcessMap
              graph={g}
              selectedStepId={selectedStepId}
              onSelectStep={setSelectedStepId}
              markers={findingCounts(findings.data)}
            />
          </Card>
        </TabsContent>

        <TabsContent value="details" className="space-y-6">
          {editing && (
            <div className="flex justify-end">
              <Button onClick={() => setStepDialog({ open: true, step: null })}>
                <Plus />
                Add step
              </Button>
            </div>
          )}
          <Card className="py-0">
            <CardContent className="px-2">
              <StepTable
                graph={g}
                onSelectStep={setSelectedStepId}
                onEdit={editing ? (step) => setStepDialog({ open: true, step }) : undefined}
                onDelete={editing ? deleteStep : undefined}
              />
            </CardContent>
          </Card>
          {editing ? (
            <>
              <ConnectionsEditor graph={g} />
              <RulesEditor graph={g} />
            </>
          ) : (
            <RulesList graph={g} />
          )}
        </TabsContent>

        <TabsContent value="issues">
          <IssuesTab graph={g} findings={findings.data} onSelectStep={setSelectedStepId} />
        </TabsContent>
        <TabsContent value="automation">
          <OpportunitiesTab graph={g} findings={findings.data} onSelectStep={setSelectedStepId} />
        </TabsContent>
        <TabsContent value="documents">
          <ProcessDocuments processId={p.id} />
        </TabsContent>
        <TabsContent value="versions" className="space-y-6">
          <VersionsPanel process={p} versionId={g.id} />
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
        findings={findings.data}
        step={selectedStep}
        onClose={() => setSelectedStepId(null)}
        onSelectStep={setSelectedStepId}
        onEdit={
          r.canEdit
            ? (step) => {
                setSelectedStepId(null);
                setStepDialog({ open: true, step });
              }
            : undefined
        }
      />
      <StepDialog
        graph={g}
        step={stepDialog.step}
        open={stepDialog.open}
        onOpenChange={(open) => setStepDialog((d) => ({ ...d, open }))}
      />
      <MetadataDialog graph={g} open={metaOpen} onOpenChange={setMetaOpen} />
    </>
  );
}

function ProcessHeader({
  process: p,
  graph: g,
  readiness: r,
  editing,
  onToggleEdit,
  onEditDetails,
  onVersionChange,
}: {
  process: ProcessDetail;
  graph: VersionGraph;
  readiness: Readiness;
  editing: boolean;
  onToggleEdit: () => void;
  onEditDetails: () => void;
  onVersionChange: (id: string) => void;
}) {
  const { user } = useAuth();
  const lastReviewed = g.approvedAt ?? g.validatedAt;
  const isOwner = !!user && p.owner?.id === user.id;
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
        {g.kind === 'to_be' && (
          <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900 dark:bg-violet-950 dark:text-violet-200">
            To-Be design
          </span>
        )}
        {p.archivedAt && (
          <span className="text-muted-foreground text-sm">Archived {formatDate(p.archivedAt)}</span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <GovernanceBar
            process={p}
            graph={g}
            readiness={r}
            editing={editing}
            onToggleEdit={onToggleEdit}
          />
          {r.canDesignToBe && <DesignToBeButton process={p} graph={g} />}
          <ProcessDownloadMenu versionId={g.id} slug={p.slug} />
        </div>
      </div>
      {g.changeSummary && g.versionNumber > 1 && (
        <p className="text-muted-foreground mt-1 text-sm">
          Version {g.versionNumber}: {g.changeSummary}
        </p>
      )}
      {isOwner && g.status === 'under_validation' && (
        <p className="mt-2 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-100">
          You own this process. Review the map and details, resolve any open items, then validate it
          — or return it with a comment.
        </p>
      )}
      {g.description && <p className="text-muted-foreground mt-1 max-w-3xl">{g.description}</p>}

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <Meta label="Department">{p.department.name}</Meta>
        <Meta label="Process owner">
          {r.canAssignOwner ? <OwnerSelect process={p} /> : (p.owner?.displayName ?? 'Unassigned')}
        </Meta>
        <Meta label="Version">
          {p.versions.length > 1 ? (
            <Select value={g.id} onValueChange={onVersionChange}>
              <SelectTrigger size="sm" className="h-7 w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {p.versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.kind === 'to_be' ? 'To-Be ' : ''}v{v.versionNumber} · {humanize(v.status)}
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

      <Card className="relative mt-4 py-4">
        {editing && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2"
            onClick={onEditDetails}
          >
            <Pencil />
            Edit details
          </Button>
        )}
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
