import { and, eq } from 'drizzle-orm';
import { departments, documentChunks, documents, knowledgeBases, type Db } from '@process-ai/db';
import { REVIEW_THRESHOLD, ruleClassify, type DocumentClassifier } from './classify.js';
import { chunkBlocks } from './chunk.js';
import type { Embedder } from './embedder.js';
import { inspectFile } from './files.js';
import { parseDocument, type Block } from './parse.js';
import type { FileStore } from './storage.js';

const EMBED_BATCH = 64;

/**
 * Parses, chunks and embeds one document, replacing any previous chunks. Status moves
 * pending → processing → ready | failed, with a readable error for admins.
 */
export async function ingestDocument(
  deps: { db: Db; store: FileStore; embedder: Embedder; classifier?: DocumentClassifier | null },
  documentId: string,
) {
  const { db, store, embedder } = deps;
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!doc) return;
  await db.update(documents).set({ status: 'processing', error: null }).where(eq(documents.id, doc.id));

  try {
    const buffer = await store.get(doc.storageKey);
    const { kind } = await inspectFile(buffer, doc.filename);
    const blocks = await parseDocument(buffer, kind);
    // Auto-sorted uploads are classified once (re-indexing keeps the decision).
    if ((doc.categorySource !== 'user' && !doc.classificationReason) || !doc.knowledgeBaseId) {
      await classify(db, deps.classifier ?? null, doc, blocks);
    }
    const chunks = chunkBlocks(blocks);

    const vectors: number[][] = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      vectors.push(...(await embedder.embed(chunks.slice(i, i + EMBED_BATCH).map((c) => c.content))));
    }

    await db.transaction(async (tx) => {
      await tx.delete(documentChunks).where(eq(documentChunks.documentId, doc.id));
      for (let i = 0; i < chunks.length; i += 200) {
        await tx.insert(documentChunks).values(
          chunks.slice(i, i + 200).map((c, j) => ({
            documentId: doc.id,
            chunkIndex: i + j,
            content: c.content,
            headingPath: c.headingPath,
            page: c.page,
            sheet: c.sheet,
            tokenCount: c.tokenCount,
            embedding: vectors[i + j]!,
          })),
        );
      }
      await tx.update(documents).set({ status: 'ready', chunkCount: chunks.length, error: null }).where(eq(documents.id, doc.id));
    });
    return { chunks: chunks.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.update(documents).set({ status: 'failed', error: message.slice(0, 500) }).where(eq(documents.id, doc.id));
    throw e;
  }
}

const titleFromFilename = (filename: string) => filename.replace(/\.[^.]+$/, '');

/**
 * Decides category, knowledge base and metadata for an auto-sorted upload. Never overrides
 * what the uploader set explicitly; low confidence or no matching knowledge base → review inbox.
 */
async function classify(db: Db, classifier: DocumentClassifier | null, doc: typeof documents.$inferSelect, blocks: Block[]) {
  const excerpt = blocks
    .map((b) => (b.kind === 'heading' ? `# ${b.text}` : b.text))
    .join('\n')
    .slice(0, 4000);
  const kbRows = await db
    .select({ id: knowledgeBases.id, name: knowledgeBases.name, description: knowledgeBases.description, departmentName: departments.name })
    .from(knowledgeBases)
    .leftJoin(departments, eq(departments.id, knowledgeBases.departmentId))
    .where(and(eq(knowledgeBases.isActive, true), doc.knowledgeBaseId ? eq(knowledgeBases.id, doc.knowledgeBaseId) : undefined));

  const keepCategory = doc.categorySource === 'user';
  const update: Partial<typeof documents.$inferInsert> = {};

  // If the AI call fails, fall back to the keyword rules rather than failing the document.
  const c = classifier
    ? await classifier.classify({ filename: doc.filename, excerpt, knowledgeBases: kbRows }).catch(() => null)
    : null;
  if (c) {
    const knowledgeBaseId = doc.knowledgeBaseId ?? (kbRows.some((k) => k.id === c.knowledgeBaseId) ? c.knowledgeBaseId : null);
    Object.assign(update, {
      ...(keepCategory ? {} : { category: c.category, categorySource: 'ai' as const }),
      knowledgeBaseId,
      classificationConfidence: Math.max(0, Math.min(1, c.confidence)),
      classificationReason: c.reason.slice(0, 500),
      needsReview: !knowledgeBaseId || c.confidence < REVIEW_THRESHOLD,
    });
    if (c.title && doc.title === titleFromFilename(doc.filename)) update.title = c.title.slice(0, 200);
    if (c.docVersion && !doc.docVersion) update.docVersion = c.docVersion.slice(0, 50);
    if (c.effectiveDate && !doc.effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(c.effectiveDate)) update.effectiveDate = c.effectiveDate;
  } else {
    const rule = ruleClassify(doc.filename, excerpt);
    const knowledgeBaseId = doc.knowledgeBaseId ?? (kbRows.length === 1 ? kbRows[0]!.id : null);
    Object.assign(update, {
      ...(keepCategory ? {} : { category: rule.category, categorySource: 'rule' as const }),
      knowledgeBaseId,
      classificationConfidence: rule.matched ? 0.6 : 0.2,
      classificationReason: rule.matched
        ? 'Matched keywords in the file name or first heading (AI classification unavailable).'
        : 'AI classification unavailable and no keywords matched.',
      needsReview: !knowledgeBaseId || !rule.matched,
    });
  }
  await db.update(documents).set(update).where(eq(documents.id, doc.id));
}
