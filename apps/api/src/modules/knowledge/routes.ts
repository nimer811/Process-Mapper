import { createHash, randomUUID } from 'node:crypto';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyRequest } from 'fastify';
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
  BulkUploadResult,
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
import { flagDocumentChange, replacedDocuments } from '../reviews/service.js';
import { documentsForProcess, listDocuments, listKnowledgeBases, slugify } from './service.js';

const IdParams = z.object({ id: z.uuid() });

const UploadFields = z.object({
  title: z.string().trim().max(200).optional(),
  /** Omit (or "auto") to let the AI choose. */
  category: DocumentCategory.optional(),
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
          await audit(tx as unknown as Db, request, {
            action: 'knowledge_base.created',
            entityType: 'knowledge_base',
            entityId: kb!.id,
            after: kb,
          });
          return kb!;
        });
        const [kb] = await listKnowledgeBases(db, { includeInactive: true, id: created.id });
        return reply.status(201).send(kb!);
      } catch (e) {
        if (isUniqueViolation(e))
          throw app.httpErrors.conflict('A knowledge base with this name already exists');
        throw e;
      }
    },
  );

  app.patch(
    '/knowledge-bases/:id',
    {
      schema: {
        params: IdParams,
        body: KnowledgeBaseInput.partial(),
        response: { 200: KnowledgeBase },
      },
    },
    async (request) => {
      app.requireRole(request, 'admin');
      const before = await db.query.knowledgeBases.findFirst({
        where: eq(knowledgeBases.id, request.params.id),
      });
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
        await audit(tx as unknown as Db, request, {
          action: 'knowledge_base.updated',
          entityType: 'knowledge_base',
          entityId: before.id,
          before,
          after,
        });
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
      return listDocuments(db, {
        knowledgeBaseId: request.params.id,
        activeOnly: !user.roles.includes('admin'),
      });
    },
  );

  type StoredFile = { buffer: Buffer; filename: string };

  /** Reads a multipart request: files plus string fields. */
  const readParts = async (request: FastifyRequest, maxFiles: number) => {
    const fields: Record<string, string> = {};
    const files: StoredFile[] = [];
    try {
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (files.length >= maxFiles)
            throw app.httpErrors.badRequest(`Upload at most ${maxFiles} file(s) at a time`);
          files.push({ buffer: await part.toBuffer(), filename: part.filename.slice(0, 200) });
        } else if (typeof part.value === 'string') {
          fields[part.fieldname] = part.value;
        }
      }
    } catch (e) {
      if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE')
        throw app.httpErrors.payloadTooLarge('A file is larger than 25 MB');
      throw e;
    }
    return { fields, files };
  };

  /**
   * Checks and stores one file and queues it for indexing. Without a category (or knowledge base)
   * the AI sorts it during indexing. Throws an HTTP error with a readable reason on rejection.
   */
  const storeOne = async (
    request: FastifyRequest,
    file: StoredFile,
    meta: z.infer<typeof UploadFields> & { knowledgeBaseId: string | null },
  ) => {
    let kind;
    try {
      kind = await inspectFile(file.buffer, file.filename);
    } catch (e) {
      if (e instanceof UnsupportedFileError) throw app.httpErrors.unsupportedMediaType(e.message);
      throw e;
    }
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const [dup] = await db
      .select({ title: documents.title, kb: knowledgeBases.name })
      .from(documents)
      .leftJoin(knowledgeBases, eq(knowledgeBases.id, documents.knowledgeBaseId))
      .where(eq(documents.sha256, sha256));
    if (dup)
      throw app.httpErrors.conflict(
        `Already uploaded as "${dup.title}"${dup.kb ? ` in ${dup.kb}` : ''}`,
      );

    const storageKey = `documents/${randomUUID()}.${extensionFor[kind.kind]}`;
    await store.put(storageKey, file.buffer);
    try {
      const created = await db.transaction(async (tx) => {
        const [doc] = await tx
          .insert(documents)
          .values({
            knowledgeBaseId: meta.knowledgeBaseId,
            title: meta.title || file.filename.replace(/\.[^.]+$/, ''),
            filename: file.filename,
            mimeType: kind.mimeType,
            sizeBytes: file.buffer.length,
            sha256,
            storageKey,
            category: meta.category ?? 'other',
            categorySource: meta.category ? 'user' : 'ai',
            docVersion: meta.docVersion ?? null,
            effectiveDate: meta.effectiveDate ?? null,
            processId: meta.processId ?? null,
            uploadedBy: request.user!.id,
          })
          .returning();
        await audit(tx as unknown as Db, request, {
          action: 'document.uploaded',
          entityType: 'document',
          entityId: doc!.id,
          after: {
            title: doc!.title,
            filename: doc!.filename,
            category: meta.category ?? 'auto',
            sha256,
          },
        });
        return doc!;
      });
      await jobs.enqueueIngest(created.id);
      // A document with the same title in the same knowledge base is a new version of it.
      for (const old of await replacedDocuments(db, created.id)) {
        await flagDocumentChange(
          db,
          old.id,
          `A newer version was uploaded (${file.filename}).`,
        ).catch((err) => request.log.warn({ err }, 'Change alert failed'));
      }
      return created;
    } catch (e) {
      await store.delete(storageKey);
      if (isUniqueViolation(e))
        throw app.httpErrors.conflict('This file is already in the knowledge base');
      throw e;
    }
  };

  const parseFields = (fields: Record<string, string>) => {
    const parsed = UploadFields.safeParse(
      Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== '' && v !== 'auto')),
    );
    if (!parsed.success)
      throw app.httpErrors.badRequest(
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    return parsed.data;
  };

  /** Upload into one knowledge base (multipart: `file` plus optional metadata; no category = auto-detect). */
  app.post(
    '/knowledge-bases/:id/documents',
    { schema: { params: IdParams } },
    async (request, reply) => {
      app.requireRole(request, 'admin');
      const kb = await db.query.knowledgeBases.findFirst({
        where: eq(knowledgeBases.id, request.params.id),
      });
      if (!kb) throw app.httpErrors.notFound('Knowledge base not found');
      const { fields, files } = await readParts(request, 1);
      if (!files[0]) throw app.httpErrors.badRequest('No file uploaded');
      const created = await storeOne(request, files[0], {
        ...parseFields(fields),
        knowledgeBaseId: kb.id,
      });
      const [doc] = await listDocuments(db, { documentId: created.id });
      return reply.status(201).send(doc);
    },
  );

  /**
   * Smart bulk upload: any number of files, no metadata needed. The AI files each one into the right
   * knowledge base and category while indexing; unsure cases go to the review inbox.
   */
  app.post(
    '/documents/bulk',
    { schema: { response: { 201: BulkUploadResult } } },
    async (request, reply) => {
      app.requireRole(request, 'admin');
      const { files } = await readParts(request, MAX_BULK_FILES);
      if (!files.length) throw app.httpErrors.badRequest('No files uploaded');
      const createdIds: string[] = [];
      const rejected: { filename: string; reason: string }[] = [];
      for (const file of files) {
        try {
          createdIds.push((await storeOne(request, file, { knowledgeBaseId: null })).id);
        } catch (e) {
          rejected.push({
            filename: file.filename,
            reason: e instanceof Error ? e.message : 'Upload failed',
          });
        }
      }
      return reply
        .status(201)
        .send({ created: await listDocuments(db, { documentIds: createdIds }), rejected });
    },
  );

  /** Documents being sorted, unsorted, or flagged for review. */
  app.get(
    '/documents/inbox',
    { schema: { response: { 200: z.array(KnowledgeDocument) } } },
    async (request) => {
      app.requireRole(request, 'admin');
      return listDocuments(db, { inbox: true });
    },
  );

  app.patch(
    '/documents/:id',
    { schema: { params: IdParams, body: DocumentPatch, response: { 200: KnowledgeDocument } } },
    async (request) => {
      app.requireRole(request, 'admin');
      const before = await db.query.documents.findFirst({
        where: eq(documents.id, request.params.id),
      });
      if (!before) throw app.httpErrors.notFound('Document not found');
      const { reviewed, ...changes } = request.body;
      if (changes.knowledgeBaseId) {
        const kb = await db.query.knowledgeBases.findFirst({
          where: eq(knowledgeBases.id, changes.knowledgeBaseId),
        });
        if (!kb) throw app.httpErrors.badRequest('Unknown knowledge base');
      }
      // An admin choosing the category or knowledge base (or confirming the AI's choice) settles it.
      const settles =
        reviewed || changes.category !== undefined || changes.knowledgeBaseId !== undefined;
      const set = {
        ...changes,
        ...(changes.category !== undefined && { categorySource: 'user' as const }),
        ...(settles && { needsReview: false }),
      };
      if (settles && !(changes.knowledgeBaseId ?? before.knowledgeBaseId)) {
        throw app.httpErrors.badRequest('Choose a knowledge base for this document');
      }
      await db.transaction(async (tx) => {
        const [after] = await tx
          .update(documents)
          .set(set)
          .where(eq(documents.id, before.id))
          .returning();
        await audit(tx as unknown as Db, request, {
          action: 'document.updated',
          entityType: 'document',
          entityId: before.id,
          before: { ...before },
          after,
        });
      });
      // Changes that matter to processes relying on the document.
      const what = [
        changes.isActive === false && before.isActive && 'deactivated',
        changes.isActive === true && !before.isActive && 'reactivated',
        changes.docVersion !== undefined &&
          changes.docVersion !== before.docVersion &&
          `version changed to ${changes.docVersion ?? 'none'}`,
        changes.effectiveDate !== undefined &&
          changes.effectiveDate !== before.effectiveDate &&
          `effective date changed to ${changes.effectiveDate ?? 'none'}`,
        changes.title !== undefined &&
          changes.title !== before.title &&
          `renamed to "${changes.title}"`,
      ].filter(Boolean);
      if (what.length) {
        await flagDocumentChange(db, before.id, `The document was ${what.join(', ')}.`).catch(
          (err) => request.log.warn({ err }, 'Change alert failed'),
        );
      }
      const [doc] = await listDocuments(db, { documentId: before.id });
      return doc!;
    },
  );

  app.post('/documents/:id/reindex', { schema: { params: IdParams } }, async (request, reply) => {
    app.requireRole(request, 'admin');
    const doc = await db.query.documents.findFirst({ where: eq(documents.id, request.params.id) });
    if (!doc) throw app.httpErrors.notFound('Document not found');
    await db
      .update(documents)
      .set({ status: 'pending', error: null })
      .where(eq(documents.id, doc.id));
    await jobs.enqueueIngest(doc.id);
    return reply.status(202).send();
  });

  app.delete('/documents/:id', { schema: { params: IdParams } }, async (request, reply) => {
    app.requireRole(request, 'admin');
    const doc = await db.query.documents.findFirst({ where: eq(documents.id, request.params.id) });
    if (!doc) throw app.httpErrors.notFound('Document not found');
    // Alert relying processes while the document (and its passages) can still be traced.
    await flagDocumentChange(db, doc.id, 'The document was removed from the knowledge base.').catch(
      (err) => request.log.warn({ err }, 'Change alert failed'),
    );
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
    const kb = doc?.knowledgeBaseId
      ? await db.query.knowledgeBases.findFirst({
          where: eq(knowledgeBases.id, doc.knowledgeBaseId),
        })
      : null;
    // Admins can open anything (including unsorted uploads); others only sorted, active documents.
    const visible = doc && (user.roles.includes('admin') || (kb && doc.isActive && kb.isActive));
    if (!visible) throw app.httpErrors.notFound('Document not found');
    const body = await store.get(doc.storageKey);
    const safeName = doc.filename.replace(/[^\w.\- ]/g, '_');
    return reply
      .type(doc.mimeType)
      .header(
        'content-disposition',
        `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      )
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
      if (!embedder)
        throw app.httpErrors.serviceUnavailable(
          'The embedding model is not configured. Set LLM_API_KEY.',
        );
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

const MAX_BULK_FILES = 50;
export const UPLOAD_LIMITS = { fileSize: MAX_UPLOAD_BYTES, files: MAX_BULK_FILES, fields: 10 };
