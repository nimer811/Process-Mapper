import { createHash, randomUUID } from 'node:crypto';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { documents, eq, knowledgeBases, type Db } from '@process-ai/db';
import {
  citationLabel,
  inspectFile,
  MAX_UPLOAD_BYTES,
  searchKnowledge,
  UnsupportedFileError,
  type Embedder,
  type FileStore,
} from '@process-ai/knowledge';
import {
  DocumentCategory,
  DocumentPatch,
  KnowledgeBase,
  KnowledgeBaseInput,
  KnowledgeDocument,
  KnowledgeSearchInput,
  KnowledgeSearchResult,
} from '@process-ai/shared';
import { audit } from '../../lib/audit.js';
import type { JobQueue } from '../../lib/jobs.js';
import { documentsForProcess, listDocuments, listKnowledgeBases, slugify } from './service.js';

const IdParams = z.object({ id: z.uuid() });

const UploadFields = z.object({
  title: z.string().trim().max(200).optional(),
  category: DocumentCategory,
  docVersion: z.string().trim().max(50).optional(),
  effectiveDate: z.iso.date().optional(),
  processId: z.uuid().optional(),
});

const extensionFor = { pdf: 'pdf', docx: 'docx', xlsx: 'xlsx', txt: 'txt' } as const;

const isUniqueViolation = (e: unknown) =>
  ((e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code) === '23505';

export const knowledgeRoutes: FastifyPluginAsyncZod<{
  db: Db;
  store: FileStore;
  embedder: Embedder | null;
  jobs: JobQueue;
}> = async (app, { db, store, embedder, jobs }) => {
  // ---- Knowledge bases ----

  app.get(
    '/knowledge-bases',
    { schema: { response: { 200: z.array(KnowledgeBase) } } },
    async (request) => {
      const user = app.requireUser(request);
      return listKnowledgeBases(db, { includeInactive: user.roles.includes('admin') });
    },
  );

  app.post(
    '/knowledge-bases',
    { schema: { body: KnowledgeBaseInput, response: { 201: KnowledgeBase } } },
    async (request, reply) => {
      app.requireRole(request, 'admin');
      const body = request.body;
      try {
        const created = await db.transaction(async (tx) => {
          const [kb] = await tx
            .insert(knowledgeBases)
            .values({
              name: body.name,
              slug: slugify(body.name),
              description: body.description ?? null,
              departmentId: body.departmentId ?? null,
              createdBy: request.user!.id,
            })
            .returning();
          await audit(tx as unknown as Db, request, { action: 'knowledge_base.created', entityType: 'knowledge_base', entityId: kb!.id, after: kb });
          return kb!;
        });
        const [kb] = await listKnowledgeBases(db, { includeInactive: true, id: created.id });
        return reply.status(201).send(kb!);
      } catch (e) {
        if (isUniqueViolation(e)) throw app.httpErrors.conflict('A knowledge base with this name already exists');
        throw e;
      }
    },
  );

  app.patch(
    '/knowledge-bases/:id',
    { schema: { params: IdParams, body: KnowledgeBaseInput.partial(), response: { 200: KnowledgeBase } } },
    async (request) => {
      app.requireRole(request, 'admin');
      const before = await db.query.knowledgeBases.findFirst({ where: eq(knowledgeBases.id, request.params.id) });
      if (!before) throw app.httpErrors.notFound('Knowledge base not found');
      const { name, description, departmentId, isActive } = request.body;
      await db.transaction(async (tx) => {
        const [after] = await tx
          .update(knowledgeBases)
          .set({
            ...(name !== undefined && { name }),
            ...(description !== undefined && { description }),
            ...(departmentId !== undefined && { departmentId }),
            ...(isActive !== undefined && { isActive }),
          })
          .where(eq(knowledgeBases.id, before.id))
          .returning();
        await audit(tx as unknown as Db, request, { action: 'knowledge_base.updated', entityType: 'knowledge_base', entityId: before.id, before, after });
      });
      const [kb] = await listKnowledgeBases(db, { includeInactive: true, id: before.id });
      return kb!;
    },
  );

  // ---- Documents ----

  app.get(
    '/knowledge-bases/:id/documents',
    { schema: { params: IdParams, response: { 200: z.array(KnowledgeDocument) } } },
    async (request) => {
      const user = app.requireUser(request);
      return listDocuments(db, { knowledgeBaseId: request.params.id, activeOnly: !user.roles.includes('admin') });
    },
  );

  /** Upload (multipart: one `file` plus metadata fields). Indexing runs in the background. */
  app.post('/knowledge-bases/:id/documents', { schema: { params: IdParams } }, async (request, reply) => {
    app.requireRole(request, 'admin');
    const kb = await db.query.knowledgeBases.findFirst({ where: eq(knowledgeBases.id, request.params.id) });
    if (!kb) throw app.httpErrors.notFound('Knowledge base not found');

    const fields: Record<string, string> = {};
    let file: { buffer: Buffer; filename: string } | null = null;
    try {
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (file) throw app.httpErrors.badRequest('Upload one file at a time');
          file = { buffer: await part.toBuffer(), filename: part.filename.slice(0, 200) };
        } else if (typeof part.value === 'string') {
          fields[part.fieldname] = part.value;
        }
      }
    } catch (e) {
      if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') throw app.httpErrors.payloadTooLarge('The file is larger than 25 MB');
      throw e;
    }
    if (!file) throw app.httpErrors.badRequest('No file uploaded');
    const parsed = UploadFields.safeParse(Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== '')));
    if (!parsed.success) throw app.httpErrors.badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));

    let kind;
    try {
      kind = await inspectFile(file.buffer, file.filename);
    } catch (e) {
      if (e instanceof UnsupportedFileError) throw app.httpErrors.unsupportedMediaType(e.message);
      throw e;
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `documents/${randomUUID()}.${extensionFor[kind.kind]}`;
    await store.put(storageKey, file.buffer);
    let created;
    try {
      created = await db.transaction(async (tx) => {
        const [doc] = await tx
          .insert(documents)
          .values({
            knowledgeBaseId: kb.id,
            title: parsed.data.title || file.filename.replace(/\.[^.]+$/, ''),
            filename: file.filename,
            mimeType: kind.mimeType,
            sizeBytes: file.buffer.length,
            sha256,
            storageKey,
            category: parsed.data.category,
            docVersion: parsed.data.docVersion ?? null,
            effectiveDate: parsed.data.effectiveDate ?? null,
            processId: parsed.data.processId ?? null,
            uploadedBy: request.user!.id,
          })
          .returning();
        await audit(tx as unknown as Db, request, {
          action: 'document.uploaded',
          entityType: 'document',
          entityId: doc!.id,
          after: { title: doc!.title, filename: doc!.filename, category: doc!.category, sha256 },
        });
        return doc!;
      });
    } catch (e) {
      await store.delete(storageKey);
      if (isUniqueViolation(e)) throw app.httpErrors.conflict('This file is already in the knowledge base');
      throw e;
    }

    await jobs.enqueueIngest(created.id);
    const [doc] = await listDocuments(db, { documentId: created.id });
    return reply.status(201).send(doc);
  });

  app.patch(
    '/documents/:id',
    { schema: { params: IdParams, body: DocumentPatch, response: { 200: KnowledgeDocument } } },
    async (request) => {
      app.requireRole(request, 'admin');
      const before = await db.query.documents.findFirst({ where: eq(documents.id, request.params.id) });
      if (!before) throw app.httpErrors.notFound('Document not found');
      await db.transaction(async (tx) => {
        const [after] = await tx.update(documents).set(request.body).where(eq(documents.id, before.id)).returning();
        await audit(tx as unknown as Db, request, { action: 'document.updated', entityType: 'document', entityId: before.id, before: { ...before }, after });
      });
      const [doc] = await listDocuments(db, { documentId: before.id });
      return doc!;
    },
  );

  app.post('/documents/:id/reindex', { schema: { params: IdParams } }, async (request, reply) => {
    app.requireRole(request, 'admin');
    const doc = await db.query.documents.findFirst({ where: eq(documents.id, request.params.id) });
    if (!doc) throw app.httpErrors.notFound('Document not found');
    await db.update(documents).set({ status: 'pending', error: null }).where(eq(documents.id, doc.id));
    await jobs.enqueueIngest(doc.id);
    return reply.status(202).send();
  });

  app.delete('/documents/:id', { schema: { params: IdParams } }, async (request, reply) => {
    app.requireRole(request, 'admin');
    const doc = await db.query.documents.findFirst({ where: eq(documents.id, request.params.id) });
    if (!doc) throw app.httpErrors.notFound('Document not found');
    await db.transaction(async (tx) => {
      await tx.delete(documents).where(eq(documents.id, doc.id)); // chunks cascade; evidence keeps the row with chunk_id null
      await audit(tx as unknown as Db, request, {
        action: 'document.deleted',
        entityType: 'document',
        entityId: doc.id,
        before: { title: doc.title, filename: doc.filename, sha256: doc.sha256 },
      });
    });
    await store.delete(doc.storageKey);
    return reply.status(204).send();
  });

  app.get('/documents/:id/download', { schema: { params: IdParams } }, async (request, reply) => {
    const user = app.requireUser(request);
    const doc = await db.query.documents.findFirst({ where: eq(documents.id, request.params.id) });
    const kb = doc && (await db.query.knowledgeBases.findFirst({ where: eq(knowledgeBases.id, doc.knowledgeBaseId) }));
    const visible = doc && kb && (user.roles.includes('admin') || (doc.isActive && kb.isActive));
    if (!visible) throw app.httpErrors.notFound('Document not found');
    const body = await store.get(doc.storageKey);
    const safeName = doc.filename.replace(/[^\w.\- ]/g, '_');
    return reply
      .type(doc.mimeType)
      .header('content-disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(doc.filename)}`)
      .header('x-content-type-options', 'nosniff')
      .send(body);
  });

  app.get(
    '/processes/:id/documents',
    { schema: { params: IdParams, response: { 200: z.array(KnowledgeDocument) } } },
    async (request) => {
      app.requireUser(request);
      const docs = await documentsForProcess(db, request.params.id);
      if (!docs) throw app.httpErrors.notFound('Process not found');
      return docs;
    },
  );

  // ---- Search (admin test tool; the interviewer uses the same retrieval) ----

  app.post(
    '/knowledge/search',
    { schema: { body: KnowledgeSearchInput, response: { 200: z.array(KnowledgeSearchResult) } } },
    async (request) => {
      app.requireRole(request, 'admin');
      if (!embedder) throw app.httpErrors.serviceUnavailable('The embedding model is not configured. Set LLM_API_KEY.');
      const results = await searchKnowledge(db, embedder, {
        query: request.body.query,
        departmentId: request.body.departmentId ?? null,
        limit: request.body.limit ?? 8,
      });
      return results.map((r) => ({
        chunkId: r.chunkId,
        documentId: r.documentId,
        documentTitle: r.documentTitle,
        category: r.category,
        knowledgeBaseName: r.knowledgeBaseName,
        citation: citationLabel(r),
        content: r.content,
        score: r.score,
      }));
    },
  );
};

export const UPLOAD_LIMITS = { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10 };
