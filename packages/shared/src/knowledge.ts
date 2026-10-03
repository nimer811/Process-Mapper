import { z } from 'zod';
import { DocumentCategory, DocumentStatus } from './process.js';

export const KnowledgeBase = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  department: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  isActive: z.boolean(),
  documentCount: z.number().int(),
  readyCount: z.number().int(),
});
export type KnowledgeBase = z.infer<typeof KnowledgeBase>;

export const KnowledgeBaseInput = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  departmentId: z.uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type KnowledgeBaseInput = z.infer<typeof KnowledgeBaseInput>;

export const KnowledgeDocument = z.object({
  id: z.uuid(),
  knowledgeBaseId: z.uuid(),
  title: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  category: DocumentCategory,
  processId: z.uuid().nullable(),
  docVersion: z.string().nullable(),
  effectiveDate: z.string().nullable(),
  isActive: z.boolean(),
  status: DocumentStatus,
  error: z.string().nullable(),
  chunkCount: z.number().int(),
  uploadedBy: z.object({ id: z.uuid(), displayName: z.string() }),
  createdAt: z.iso.datetime(),
});
export type KnowledgeDocument = z.infer<typeof KnowledgeDocument>;

export const DocumentPatch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  category: DocumentCategory.optional(),
  docVersion: z.string().trim().max(50).nullable().optional(),
  effectiveDate: z.iso.date().nullable().optional(),
  processId: z.uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type DocumentPatch = z.infer<typeof DocumentPatch>;

export const KnowledgeSearchInput = z.object({
  query: z.string().trim().min(2).max(500),
  departmentId: z.uuid().nullable().optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

export const KnowledgeSearchResult = z.object({
  chunkId: z.uuid(),
  documentId: z.uuid(),
  documentTitle: z.string(),
  category: DocumentCategory,
  knowledgeBaseName: z.string(),
  citation: z.string(),
  content: z.string(),
  score: z.number(),
});
export type KnowledgeSearchResult = z.infer<typeof KnowledgeSearchResult>;
