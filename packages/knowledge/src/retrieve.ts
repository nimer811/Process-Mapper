import { sql } from 'drizzle-orm';
import type { Db } from '@process-ai/db';
import type { DocumentCategory } from '@process-ai/shared';
import type { Embedder } from './embedder.js';

export interface SearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  category: DocumentCategory;
  knowledgeBaseName: string;
  headingPath: string | null;
  page: number | null;
  sheet: string | null;
  content: string;
  score: number;
}

export interface SearchOptions {
  query: string;
  /** Limit to knowledge bases of this department (plus organisation-wide ones). */
  departmentId?: string | null;
  limit?: number;
}

const RRF_K = 60;
const CANDIDATES = 20;

/**
 * Hybrid retrieval: vector similarity (meaning) and full-text search (exact terms such as
 * "AED 50,000" or form numbers), merged with reciprocal-rank fusion. Only active, indexed
 * documents in active knowledge bases are searched.
 */
export async function searchKnowledge(
  db: Db,
  embedder: Embedder,
  opts: SearchOptions,
): Promise<SearchResult[]> {
  const query = opts.query.trim().slice(0, 2000);
  if (!query) return [];
  const limit = opts.limit ?? 5;
  const [vector] = await embedder.embed([query]);
  const vectorLiteral = `[${vector!.join(',')}]`;
  const scope = opts.departmentId
    ? sql`(kb.department_id = ${opts.departmentId} or kb.department_id is null)`
    : sql`true`;

  const rows = await db.execute<{
    chunk_id: string;
    document_id: string;
    title: string;
    category: DocumentCategory;
    kb_name: string;
    heading_path: string | null;
    page: number | null;
    sheet: string | null;
    content: string;
    score: number;
  }>(sql`
    with eligible as (
      select c.id, c.embedding, c.tsv
      from document_chunks c
      join documents d on d.id = c.document_id
      join knowledge_bases kb on kb.id = d.knowledge_base_id
      where d.is_active and d.status = 'ready' and kb.is_active and ${scope}
    ),
    semantic as (
      select id, row_number() over (order by embedding <=> ${vectorLiteral}::vector) as rank
      from eligible
      order by embedding <=> ${vectorLiteral}::vector
      limit ${CANDIDATES}
    ),
    lexical as (
      select id, row_number() over (order by ts_rank_cd(tsv, q) desc) as rank
      from eligible, websearch_to_tsquery('english', ${query}) q
      where tsv @@ q
      order by ts_rank_cd(tsv, q) desc
      limit ${CANDIDATES}
    ),
    fused as (
      select id, sum(1.0 / (${RRF_K} + rank)) as score
      from (select * from semantic union all select * from lexical) r
      group by id
    )
    select c.id as chunk_id, d.id as document_id, d.title, d.category, kb.name as kb_name,
           c.heading_path, c.page, c.sheet, c.content, f.score::float as score
    from fused f
    join document_chunks c on c.id = f.id
    join documents d on d.id = c.document_id
    join knowledge_bases kb on kb.id = d.knowledge_base_id
    order by f.score desc
    limit ${limit}
  `);

  return rows.rows.map((r) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    documentTitle: r.title,
    category: r.category,
    knowledgeBaseName: r.kb_name,
    headingPath: r.heading_path,
    page: r.page,
    sheet: r.sheet,
    content: r.content,
    score: Number(r.score),
  }));
}

/** Short human reference for a result, e.g. "Procurement Policy, 4.2 Approvals" or "DoA Matrix, sheet Goods". */
export function citationLabel(
  r: Pick<SearchResult, 'documentTitle' | 'headingPath' | 'page' | 'sheet'>,
) {
  const where = r.sheet
    ? `sheet ${r.sheet}`
    : r.headingPath
      ? r.headingPath.split(' > ').at(-1)
      : r.page
        ? `p. ${r.page}`
        : null;
  return where ? `${r.documentTitle}, ${where}` : r.documentTitle;
}
