import { Link, useParams } from 'react-router';
import { BookOpen, FolderPlus } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useKnowledgeBases, useKnowledgeDocuments } from '@/features/knowledge/queries';
import { KnowledgeBaseDialog } from '@/features/knowledge/knowledge-base-dialog';
import { DocumentTable } from '@/features/knowledge/document-table';
import { UploadCard } from '@/features/knowledge/upload-card';
import { SearchCard } from '@/features/knowledge/search-card';
import { useNavigate } from 'react-router';

/** Knowledge bases list. Admins manage them under /admin/knowledge; everyone can browse /knowledge. */
export function KnowledgePage({ admin = false }: { admin?: boolean }) {
  const kbs = useKnowledgeBases();
  const navigate = useNavigate();
  const base = admin ? '/admin/knowledge' : '/knowledge';
  const createButton = (
    <KnowledgeBaseDialog
      onCreated={(kb) => navigate(`/admin/knowledge/${kb.id}`)}
      trigger={
        <Button>
          <FolderPlus />
          New knowledge base
        </Button>
      }
    />
  );

  return (
    <>
      {admin && (
        <nav className="text-muted-foreground mb-2 text-sm">
          <Link to="/admin" className="hover:underline">
            Admin
          </Link>{' '}
          / Knowledge bases
        </nav>
      )}
      <PageHeader
        title={admin ? 'Knowledge bases' : 'Knowledge'}
        description="SOPs, policies, delegation of authority and approval matrices the AI interviewer uses as reference."
        actions={admin ? createButton : undefined}
      />
      {kbs.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : !kbs.data?.length ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpen />
            </EmptyMedia>
            <EmptyTitle>No knowledge bases yet</EmptyTitle>
            <EmptyDescription>
              {admin
                ? 'Create one (e.g. "Procurement") and upload its SOPs.'
                : "An admin hasn't added reference documents yet."}
            </EmptyDescription>
          </EmptyHeader>
          {admin && <EmptyContent>{createButton}</EmptyContent>}
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kbs.data.map((kb) => (
            <Link key={kb.id} to={`${base}/${kb.id}`}>
              <Card className="hover:border-foreground/30 h-full transition-colors">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    {kb.name}
                    {!kb.isActive && <Badge variant="outline">Inactive</Badge>}
                  </CardTitle>
                  <CardDescription>
                    {kb.department ? kb.department.name : 'All departments'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">
                  {kb.documentCount} document{kb.documentCount === 1 ? '' : 's'}
                  {admin &&
                    kb.documentCount > kb.readyCount &&
                    ` · ${kb.documentCount - kb.readyCount} not ready`}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export function KnowledgeBasePage({ admin = false }: { admin?: boolean }) {
  const { knowledgeBaseId = '' } = useParams();
  const kbs = useKnowledgeBases();
  const kb = kbs.data?.find((k) => k.id === knowledgeBaseId);
  const docs = useKnowledgeDocuments(knowledgeBaseId);

  if (kbs.isSuccess && !kb) return <PageHeader title="Knowledge base not found" />;

  return (
    <>
      <nav className="text-muted-foreground mb-2 text-sm">
        {admin ? (
          <>
            <Link to="/admin" className="hover:underline">
              Admin
            </Link>{' '}
            /{' '}
            <Link to="/admin/knowledge" className="hover:underline">
              Knowledge bases
            </Link>
          </>
        ) : (
          <Link to="/knowledge" className="hover:underline">
            Knowledge
          </Link>
        )}{' '}
        / {kb?.name}
      </nav>
      <PageHeader
        title={kb?.name ?? ''}
        description={[
          kb?.department ? `Used for ${kb.department.name} processes` : 'Used for all departments',
          kb?.description,
        ]
          .filter(Boolean)
          .join(' · ')}
      />
      <div className={admin ? 'grid items-start gap-6 xl:grid-cols-[1fr_380px]' : ''}>
        <Card className="py-0">
          <CardContent className="px-2">
            {docs.isPending ? (
              <Skeleton className="m-4 h-24" />
            ) : docs.data?.length ? (
              <DocumentTable documents={docs.data} admin={admin} />
            ) : (
              <p className="text-muted-foreground p-6 text-sm">No documents yet.</p>
            )}
          </CardContent>
        </Card>
        {admin && kb && (
          <div className="grid gap-6">
            <UploadCard knowledgeBaseId={kb.id} />
            <SearchCard departmentId={kb.department?.id ?? null} />
          </div>
        )}
      </div>
    </>
  );
}
