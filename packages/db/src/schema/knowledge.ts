import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import {
  classificationSources,
  documentCategories,
  documentStatuses,
  EMBEDDING_DIMENSIONS,
  sopStatuses,
  type SopWording,
} from '@process-ai/shared';
import { id, timestamps } from './columns.js';
import { departments, users } from './identity.js';
import { processes, processVersions } from './process.js';

export const sopStatus = pgEnum('sop_status', sopStatuses);

export const documentCategory = pgEnum('document_category', documentCategories);
export const documentStatus = pgEnum('document_status', documentStatuses);
export const classificationSource = pgEnum('classification_source', classificationSources);

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

/** A container of reference documents, e.g. "Procurement". Optionally tied to a department. */
export const knowledgeBases = pgTable('knowledge_bases', {
  id: id(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  description: text(),
  departmentId: uuid().references(() => departments.id),
  isActive: boolean().notNull().default(true),
  createdBy: uuid().references(() => users.id),
  ...timestamps,
});

export const documents = pgTable(
  'documents',
  {
    id: id(),
    /** Null while a bulk upload is waiting to be sorted (or needs an admin to choose). */
    knowledgeBaseId: uuid().references(() => knowledgeBases.id),
    title: text().notNull(),
    filename: text().notNull(),
    mimeType: text().notNull(),
    sizeBytes: bigint({ mode: 'number' }).notNull(),
    sha256: text().notNull(),
    /** Key in the file store (never derived from the user's filename). */
    storageKey: text().notNull(),
    category: documentCategory().notNull(),
    /** Who decided the category/knowledge base: the uploader, the AI, or filename rules. */
    categorySource: classificationSource().notNull().default('user'),
    classificationConfidence: numeric({ precision: 3, scale: 2, mode: 'number' }),
    classificationReason: text(),
    /** The AI wasn't confident (or couldn't choose a knowledge base); an admin should check. */
    needsReview: boolean().notNull().default(false),
    /** Optional link to one process. */
    processId: uuid().references(() => processes.id, { onDelete: 'set null' }),
    docVersion: text(),
    effectiveDate: date(),
    isActive: boolean().notNull().default(true),
    status: documentStatus().notNull().default('pending'),
    error: text(),
    chunkCount: integer().notNull().default(0),
    uploadedBy: uuid()
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [unique().on(t.knowledgeBaseId, t.sha256), index().on(t.knowledgeBaseId)],
);

export const documentChunks = pgTable(
  'document_chunks',
  {
    id: id(),
    documentId: uuid()
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    chunkIndex: integer().notNull(),
    content: text().notNull(),
    /** e.g. "4. Vendor registration > 4.2 Due diligence", or the sheet name for spreadsheets. */
    headingPath: text(),
    page: integer(),
    sheet: text(),
    tokenCount: integer().notNull(),
    embedding: vector({ dimensions: EMBEDDING_DIMENSIONS }),
    tsv: tsvector().generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(heading_path, '') || ' ' || content)`,
    ),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.documentId),
    index('document_chunks_embedding_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops')),
    index('document_chunks_tsv_gin').using('gin', t.tsv),
  ],
);

/** The SOP generated from a process version: AI-drafted wording the owner reviews, then publishes to the knowledge base. */
export const sopDocuments = pgTable('sop_documents', {
  id: id(),
  versionId: uuid()
    .notNull()
    .unique()
    .references(() => processVersions.id, { onDelete: 'cascade' }),
  docId: text().notNull(),
  docVersion: text().notNull(),
  status: sopStatus().notNull().default('draft'),
  wording: jsonb().$type<SopWording>().notNull(),
  aiDrafted: boolean().notNull().default(true),
  generatedBy: uuid().references(() => users.id),
  generatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  publishedBy: uuid().references(() => users.id),
  publishedAt: timestamp({ withTimezone: true }),
  knowledgeDocumentId: uuid().references(() => documents.id, { onDelete: 'set null' }),
  ...timestamps,
});
