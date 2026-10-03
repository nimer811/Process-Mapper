import { eq } from 'drizzle-orm';
import { documentChunks, documents, type Db } from '@process-ai/db';
import { chunkBlocks } from './chunk.js';
import type { Embedder } from './embedder.js';
import { inspectFile } from './files.js';
import { parseDocument } from './parse.js';
import type { FileStore } from './storage.js';

const EMBED_BATCH = 64;

/**
 * Parses, chunks and embeds one document, replacing any previous chunks. Status moves
 * pending → processing → ready | failed, with a readable error for admins.
 */
export async function ingestDocument(deps: { db: Db; store: FileStore; embedder: Embedder }, documentId: string) {
  const { db, store, embedder } = deps;
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!doc) return;
  await db.update(documents).set({ status: 'processing', error: null }).where(eq(documents.id, doc.id));

  try {
    const buffer = await store.get(doc.storageKey);
    const { kind } = await inspectFile(buffer, doc.filename);
    const chunks = chunkBlocks(await parseDocument(buffer, kind));

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
