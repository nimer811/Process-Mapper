import mammoth from 'mammoth';
import { parse as parseHtml, type HTMLElement } from 'node-html-parser';
import { extractText, getDocumentProxy } from 'unpdf';
import * as XLSX from 'xlsx';
import type { FileKind } from './files.js';

/** A structural unit of a document, before chunking. */
export interface Block {
  text: string;
  /** Section headings above this block, outermost first. */
  headings: string[];
  kind: 'paragraph' | 'heading' | 'row';
  page?: number;
  sheet?: string;
}

export class NoTextError extends Error {
  constructor() {
    super('No text could be extracted. If this is a scanned PDF, upload a text-based version (OCR is not supported yet).');
  }
}

const clean = (s: string) => s.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

export async function parseDocument(buffer: Buffer, kind: FileKind): Promise<Block[]> {
  const blocks =
    kind === 'pdf' ? await parsePdf(buffer)
    : kind === 'docx' ? await parseDocx(buffer)
    : kind === 'xlsx' ? parseXlsx(buffer)
    : parseText(buffer.toString('utf8'));
  if (!blocks.some((b) => b.text.trim().length > 0)) throw new NoTextError();
  return blocks;
}

async function parsePdf(buffer: Buffer): Promise<Block[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  const blocks: Block[] = [];
  text.forEach((pageText, i) => {
    for (const para of pageText.split(/\n\s*\n/)) {
      const t = clean(para);
      if (t) blocks.push({ text: t, headings: [], kind: 'paragraph', page: i + 1 });
    }
  });
  return blocks;
}

/** DOCX → HTML (mammoth) → blocks that keep the heading hierarchy and table rows. */
async function parseDocx(buffer: Buffer): Promise<Block[]> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const root = parseHtml(html);
  const blocks: Block[] = [];
  const stack: { level: number; text: string }[] = [];
  const headings = () => stack.map((h) => h.text);

  for (const el of root.childNodes as HTMLElement[]) {
    const tag = el.tagName?.toLowerCase();
    if (!tag) continue;
    const heading = /^h([1-6])$/.exec(tag);
    if (heading) {
      const level = Number(heading[1]);
      while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
      const text = clean(el.text);
      if (text) {
        stack.push({ level, text });
        blocks.push({ text, headings: headings().slice(0, -1), kind: 'heading' });
      }
    } else if (tag === 'table') {
      blocks.push(...tableRows(el, headings()));
    } else if (tag === 'ul' || tag === 'ol') {
      for (const li of el.querySelectorAll('li')) {
        const text = clean(li.text);
        if (text) blocks.push({ text: `• ${text}`, headings: headings(), kind: 'paragraph' });
      }
    } else {
      const text = clean(el.text);
      if (text) blocks.push({ text, headings: headings(), kind: 'paragraph' });
    }
  }
  return blocks;
}

/** Each table row becomes "Header: value | Header: value", so thresholds keep their meaning. */
function tableRows(table: HTMLElement, headings: string[]): Block[] {
  const rows = table.querySelectorAll('tr').map((tr) => tr.querySelectorAll('th,td').map((c) => clean(c.text)));
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  if (!body.length) return [{ text: header!.join(' | '), headings, kind: 'row' }];
  return body
    .filter((r) => r.some(Boolean))
    .map((r) => ({
      text: r.map((v, i) => (header![i] ? `${header![i]}: ${v}` : v)).filter((x) => x && !x.endsWith(': ')).join(' | '),
      headings,
      kind: 'row' as const,
    }));
}

/** XLSX: every row is serialised with its column headers (approval matrices, DoA tables). */
function parseXlsx(buffer: Buffer): Block[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellFormula: false, cellHTML: false });
  const blocks: Block[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '', raw: false });
    const nonEmpty = rows.map((r) => r.map((v) => clean(String(v ?? '')))).filter((r) => r.some(Boolean));
    if (!nonEmpty.length) continue;
    // Header = first row with at least two filled cells.
    const headerIdx = nonEmpty.findIndex((r) => r.filter(Boolean).length >= 2);
    const header = headerIdx >= 0 ? nonEmpty[headerIdx]! : [];
    nonEmpty.forEach((r, i) => {
      if (i === headerIdx) return;
      const text = r
        .map((v, c) => (v ? (header[c] && i > headerIdx ? `${header[c]}: ${v}` : v) : ''))
        .filter(Boolean)
        .join(' | ');
      if (text) blocks.push({ text, headings: [sheetName], kind: 'row', sheet: sheetName });
    });
  }
  return blocks;
}

function parseText(text: string): Block[] {
  const blocks: Block[] = [];
  let headings: string[] = [];
  for (const para of text.split(/\n\s*\n/)) {
    const t = clean(para);
    if (!t) continue;
    const md = /^(#{1,6})\s+(.*)$/.exec(t);
    if (md && !t.includes('\n')) {
      headings = [...headings.slice(0, md[1]!.length - 1), md[2]!];
      blocks.push({ text: md[2]!, headings: headings.slice(0, -1), kind: 'heading' });
    } else {
      blocks.push({ text: t, headings, kind: 'paragraph' });
    }
  }
  return blocks;
}
