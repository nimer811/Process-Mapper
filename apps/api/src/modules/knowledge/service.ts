import {
  and,
  count,
  inArray,
  departments,
  documents,
  eq,
  knowledgeBases,
  processes,
  sql,
  users,
  type Db,
} from '@process-ai/db';
import type { KnowledgeBase, KnowledgeDocument } from '@process-ai/shared';

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'knowledge-base';

export async function listKnowledgeBases(
  db: Db,
  opts: { includeInactive: boolean; id?: string },
): Promise<KnowledgeBase[]> {
  const rows = await db
    .select({
      kb: knowledgeBases,
      department: { id: departments.id, name: departments.name },
      documentCount: count(documents.id),
      readyCount:
        sql<number>`count(${documents.id}) filter (where ${documents.status} = 'ready' and ${documents.isActive})`.mapWith(
          Number,
        ),
    })
    .from(knowledgeBases)
    .leftJoin(departments, eq(departments.id, knowledgeBases.departmentId))
    .leftJoin(documents, eq(documents.knowledgeBaseId, knowledgeBases.id))
    .where(
      and(
        opts.includeInactive ? undefined : eq(knowledgeBases.isActive, true),
        opts.id ? eq(knowledgeBases.id, opts.id) : undefined,
      ),
    )
    .groupBy(knowledgeBases.id, departments.id)
    .orderBy(knowledgeBases.name);
  return rows.map((r) => ({
    id: r.kb.id,
    name: r.kb.name,
    slug: r.kb.slug,
    description: r.kb.description,
    department: r.department?.id ? r.department : null,
    isActive: r.kb.isActive,
    documentCount: r.documentCount,
    readyCount: r.readyCount,
  }));
}

const documentSelect = {
  doc: documents,
  uploader: { id: users.id, displayName: users.displayName },
  kbName: knowledgeBases.name,
};

const toDocument = (r: {
  doc: typeof documents.$inferSelect;
  uploader: { id: string; displayName: string };
  kbName: string | null;
}): KnowledgeDocument => ({
  id: r.doc.id,
  knowledgeBaseId: r.doc.knowledgeBaseId,
  knowledgeBaseName: r.kbName,
  categorySource: r.doc.categorySource,
  classificationConfidence: r.doc.classificationConfidence,
  classificationReason: r.doc.classificationReason,
  needsReview: r.doc.needsReview,
  title: r.doc.title,
  filename: r.doc.filename,
  mimeType: r.doc.mimeType,
  sizeBytes: r.doc.sizeBytes,
  category: r.doc.category,
  processId: r.doc.processId,
  docVersion: r.doc.docVersion,
  effectiveDate: r.doc.effectiveDate,
  isActive: r.doc.isActive,
  status: r.doc.status,
  error: r.doc.error,
  chunkCount: r.doc.chunkCount,
  uploadedBy: r.uploader,
  createdAt: r.doc.createdAt.toISOString(),
});

export async function listDocuments(
  db: Db,
  where: {
    knowledgeBaseId?: string;
    documentId?: string;
    documentIds?: string[];
    activeOnly?: boolean;
    inbox?: boolean;
  },
) {
  const rows = await db
    .select(documentSelect)
    .from(documents)
    .innerJoin(users, eq(users.id, documents.uploadedBy))
    .leftJoin(knowledgeBases, eq(knowledgeBases.id, documents.knowledgeBaseId))
    .where(
      and(
        where.knowledgeBaseId ? eq(documents.knowledgeBaseId, where.knowledgeBaseId) : undefined,
        where.documentId ? eq(documents.id, where.documentId) : undefined,
        where.documentIds
          ? inArray(
              documents.id,
              where.documentIds.length
                ? where.documentIds
                : ['00000000-0000-0000-0000-000000000000'],
            )
          : undefined,
        where.activeOnly ? eq(documents.isActive, true) : undefined,
        // Inbox: being sorted, unsorted, or flagged for review.
        where.inbox
          ? sql`(${documents.knowledgeBaseId} is null or ${documents.needsReview} or (${documents.categorySource} <> 'user' and ${documents.status} in ('pending', 'processing')))`
          : undefined,
      ),
    )
    .orderBy(documents.title);
  return rows.map(toDocument);
}

/** Documents shown on a process page: linked to it, or in knowledge bases of its department. */
export async function documentsForProcess(db: Db, processId: string) {
  const proc = await db.query.processes.findFirst({ where: eq(processes.id, processId) });
  if (!proc) return null;
  const rows = await db
    .select(documentSelect)
    .from(documents)
    .innerJoin(users, eq(users.id, documents.uploadedBy))
    .innerJoin(knowledgeBases, eq(knowledgeBases.id, documents.knowledgeBaseId))
    .where(
      and(
        eq(documents.isActive, true),
        eq(knowledgeBases.isActive, true),
        sql`(${documents.processId} = ${processId} or ${knowledgeBases.departmentId} = ${proc.departmentId})`,
      ),
    )
    .orderBy(sql`${documents.processId} = ${processId} desc`, documents.title);
  return rows.map(toDocument);
}
