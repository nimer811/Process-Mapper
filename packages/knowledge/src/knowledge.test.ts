import { describe, expect, it } from 'vitest';
import { chunkBlocks } from './chunk.js';
import { HashEmbedder } from './embedder.js';
import { inspectFile, UnsupportedFileError } from './files.js';
import { NoTextError, parseDocument } from './parse.js';
import { approvalMatrixXlsx, policyDocx, sopPdf } from './test/fixtures.js';

describe('inspectFile', () => {
  it('identifies files by content, not extension', async () => {
    expect((await inspectFile(await policyDocx(), 'x.bin')).kind).toBe('docx');
    expect((await inspectFile(approvalMatrixXlsx(), 'matrix.xlsx')).kind).toBe('xlsx');
    expect((await inspectFile(await sopPdf(), 'sop.pdf')).kind).toBe('pdf');
    expect((await inspectFile(Buffer.from('# Notes\n\nHello'), 'notes.md')).kind).toBe('txt');
  });

  it('rejects disguised, binary and empty files', async () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)]);
    await expect(inspectFile(exe, 'invoice.pdf')).rejects.toThrow(UnsupportedFileError);
    await expect(inspectFile(Buffer.from([0, 1, 2, 3]), 'notes.txt')).rejects.toThrow(
      UnsupportedFileError,
    );
    await expect(inspectFile(Buffer.alloc(0), 'a.pdf')).rejects.toThrow(/empty/);
  });
});

describe('parseDocument', () => {
  it('keeps the DOCX heading hierarchy and turns table rows into header: value pairs', async () => {
    const blocks = await parseDocument(await policyDocx(), 'docx');
    const finance = blocks.find((b) => b.text.includes('AED 100,000'))!;
    // Word's Title style isn't a heading; the document title is stored on the document itself.
    expect(finance.headings).toEqual(['4. Purchase approvals', '4.2 Finance review']);
    expect(
      blocks.some(
        (b) => b.kind === 'row' && b.text === 'Amount: AED 50,001 to AED 500,000 | Approver: CFO',
      ),
    ).toBe(true);
  });

  it('serialises spreadsheet rows with their column headers, per sheet', async () => {
    const blocks = await parseDocument(approvalMatrixXlsx(), 'xlsx');
    expect(blocks).toContainEqual(
      expect.objectContaining({
        sheet: 'Goods',
        text: 'Category: Goods | From (AED): 50001 | To (AED): 500000 | Approver: CFO',
      }),
    );
    expect(blocks).toContainEqual(
      expect.objectContaining({
        sheet: 'Services',
        text: 'Category: Services | Approver: Head of Procurement',
      }),
    );
  });

  it('extracts PDF text with page numbers', async () => {
    const blocks = await parseDocument(await sopPdf(), 'pdf');
    expect(blocks.find((b) => b.text.includes('World-Check'))?.page).toBe(1);
    expect(blocks.find((b) => b.text.includes('Master Data Team'))?.page).toBe(2);
  });

  it('explains when no text can be extracted', async () => {
    await expect(parseDocument(Buffer.from('   \n\n  '), 'txt')).rejects.toThrow(NoTextError);
  });
});

describe('chunkBlocks', () => {
  it('starts a new chunk at each section and prefixes the heading path', async () => {
    const chunks = chunkBlocks(await parseDocument(await policyDocx(), 'docx'));
    const finance = chunks.find((c) => c.content.includes('AED 100,000'))!;
    expect(finance.headingPath).toBe('4. Purchase approvals > 4.2 Finance review');
    expect(finance.content.startsWith(finance.headingPath!)).toBe(true);
    expect(finance.content).not.toContain('budget holder in SAP'); // that's section 4.1
  });

  it('splits very long text into bounded chunks', () => {
    const long = Array.from(
      { length: 400 },
      (_, i) => `Sentence number ${i} about procurement.`,
    ).join(' ');
    const chunks = chunkBlocks([{ text: long, headings: ['Long'], kind: 'paragraph' }]);
    expect(chunks.length).toBeGreaterThan(3);
    expect(Math.max(...chunks.map((c) => c.content.length))).toBeLessThanOrEqual(2700);
  });
});

describe('HashEmbedder', () => {
  it('gives similar vectors to texts that share words', async () => {
    const [a, b, c] = await new HashEmbedder().embed([
      'finance approval threshold',
      'finance approval',
      'vendor bank call-back',
    ]);
    const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * y[i]!, 0);
    expect(dot(a!, b!)).toBeGreaterThan(dot(a!, c!));
  });
});
