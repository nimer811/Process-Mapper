import type { Block } from './parse.js';

export interface Chunk {
  content: string;
  headingPath: string | null;
  page: number | null;
  sheet: string | null;
  tokenCount: number;
}

/** Rough token estimate (≈4 characters per token for English). */
export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

const TARGET_CHARS = 1800; // ≈450 tokens
/** Chunks with less real text than this (e.g. a lone document title) aren't worth retrieving. */
const MIN_BODY_CHARS = 25;
const MAX_CHARS = 2600;

/**
 * Groups blocks into retrieval chunks that never straddle a section (or sheet) boundary, so each
 * chunk carries one heading path. Long paragraphs are split on sentence boundaries.
 */
export function chunkBlocks(blocks: Block[]): Chunk[] {
  const chunks: Chunk[] = [];
  let buf: string[] = [];
  let len = 0;
  let key: string | null = null;
  let meta: { headingPath: string | null; page: number | null; sheet: string | null } = {
    headingPath: null,
    page: null,
    sheet: null,
  };

  const flush = () => {
    if (!buf.length) return;
    const body = buf.join('\n');
    if (body.trim().length < MIN_BODY_CHARS && !meta.sheet) {
      buf = [];
      len = 0;
      return;
    }
    const content = meta.headingPath ? `${meta.headingPath}\n${body}` : body;
    chunks.push({ content, ...meta, tokenCount: estimateTokens(content) });
    buf = [];
    len = 0;
  };

  for (const block of blocks) {
    const path = block.kind === 'heading' ? [...block.headings, block.text] : block.headings;
    const headingPath = path.length ? path.join(' > ') : null;
    const blockKey = `${headingPath ?? ''}|${block.sheet ?? ''}`;
    if (blockKey !== key || len + block.text.length > TARGET_CHARS) {
      flush();
      key = blockKey;
      meta = { headingPath, page: block.page ?? null, sheet: block.sheet ?? null };
    }
    if (block.kind === 'heading') continue; // carried in headingPath
    for (const piece of splitLong(block.text)) {
      if (len + piece.length > MAX_CHARS) {
        flush();
        meta = { headingPath, page: block.page ?? null, sheet: block.sheet ?? null };
      }
      buf.push(piece);
      len += piece.length + 1;
    }
  }
  flush();
  return chunks;
}

function splitLong(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && cur.length + s.length > TARGET_CHARS) {
      out.push(cur.trim());
      cur = '';
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.flatMap((p) =>
    p.length > MAX_CHARS ? (p.match(new RegExp(`.{1,${TARGET_CHARS}}`, 'gs')) ?? [p]) : [p],
  );
}
