import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';

const cell = (text: string) => new TableCell({ children: [new Paragraph(text)] });

/** A small but realistic procurement policy with a heading hierarchy and a DoA table. */
export async function policyDocx(): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'Procurement Policy', heading: HeadingLevel.TITLE }),
          new Paragraph({ text: '4. Purchase approvals', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: '4.1 Budget holder approval', heading: HeadingLevel.HEADING_2 }),
          new Paragraph('Every purchase requisition must be approved by the budget holder in SAP before sourcing starts.'),
          new Paragraph({ text: '4.2 Finance review', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ children: [new TextRun('Finance approval is required only for purchase requisitions above AED 100,000.')], alignment: AlignmentType.LEFT }),
          new Paragraph({ text: '5. Delegation of authority', heading: HeadingLevel.HEADING_1 }),
          new Table({
            rows: [
              new TableRow({ children: [cell('Amount'), cell('Approver')] }),
              new TableRow({ children: [cell('Up to AED 50,000'), cell('Department Head')] }),
              new TableRow({ children: [cell('AED 50,001 to AED 500,000'), cell('CFO')] }),
              new TableRow({ children: [cell('Above AED 500,000'), cell('CEO')] }),
            ],
          }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

export function approvalMatrixXlsx(): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Approval matrix — Goods'],
      ['Category', 'From (AED)', 'To (AED)', 'Approver'],
      ['Goods', 0, 50000, 'Department Head'],
      ['Goods', 50001, 500000, 'CFO'],
    ]),
    'Goods',
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Category', 'Approver'], ['Services', 'Head of Procurement']]), 'Services');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function sopPdf(): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.fontSize(16).text('Vendor Onboarding SOP');
    doc.moveDown().fontSize(11).text('All new vendors must pass sanctions screening in World-Check before approval.');
    doc.moveDown().text('Bank details are verified by a call-back to an independently sourced phone number.');
    doc.addPage().text('Vendor master records are created in SAP by the Master Data Team.');
    doc.end();
  });
}
