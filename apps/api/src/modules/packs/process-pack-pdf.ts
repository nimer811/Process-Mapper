import PDFDocument from 'pdfkit';
import type { Scene } from '@process-ai/diagram';
import { edgeStyle, palette } from '@process-ai/diagram';
import type { Issue, Opportunity, ProcessDetail, Provenance, VersionGraph } from '@process-ai/shared';
import { drawScene, drawSceneSlice } from './pdf-scene.js';

type Doc = PDFKit.PDFDocument;

const A4_PORTRAIT: [number, number] = [595.28, 841.89];
const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const A3_LANDSCAPE: [number, number] = [1190.55, 841.89];
const MARGIN = 48;

const C = {
  text: '#0f172a',
  muted: '#64748b',
  border: '#cbd5e1',
  header: '#f1f5f9',
  accent: '#0f172a',
};

const statusLabel: Record<VersionGraph['status'], string> = {
  draft: 'Draft',
  under_validation: 'Under validation',
  validated: 'Validated',
  approved: 'Approved',
  archived: 'Archived',
};

const provenanceLabel: Record<Provenance, string> = {
  stated: 'Stated by employee',
  documented: 'From SOP',
  inferred: 'AI inferred',
  confirmed: 'Confirmed',
  disputed: 'Disputed',
};

const humanize = (s: string) => {
  const t = s.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
        new Date(iso),
      )
    : '—';

export interface PackInput {
  process: ProcessDetail;
  graph: VersionGraph;
  scene: Scene;
  /** Accepted recommendations (shown separately from the documented process). */
  findings?: { issues: Issue[]; opportunities: Opportunity[] };
  generatedBy: string;
  generatedAt: Date;
}

export const packFileBase = (p: ProcessDetail, g: VersionGraph) => `${p.slug}-v${g.versionNumber}`;

/** Builds the process pack PDF: overview, process map, steps, decisions, rules, pain points, history. */
export function buildProcessPackPdf(input: PackInput): Promise<Buffer> {
  const { process: p, graph: g } = input;
  const doc = new PDFDocument({
    size: A4_PORTRAIT,
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: `${p.name} — Process pack (v${g.versionNumber})`,
      Author: input.generatedBy,
      Subject: `${p.department.name} process`,
      Creator: 'Process AI',
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  coverPage(doc, input);
  mapPage(doc, input);
  stepsSection(doc, g);
  pathsSection(doc, g);
  rulesSection(doc, g);
  painPointsSection(doc, g);
  recommendationsSection(doc, g, input.findings);
  historySection(doc, p);
  decoratePages(doc, input);

  doc.end();
  return done;
}

// ---------- building blocks ----------

/** Starts a new page (same size) when less than `needed` points remain, so headings aren't stranded. */
function ensureSpace(doc: Doc, needed: number) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    newPage(doc, [doc.page.width, doc.page.height]);
  }
}

function heading(doc: Doc, text: string) {
  ensureSpace(doc, 110);
  doc.moveDown(0.6).font('Helvetica-Bold').fontSize(14).fillColor(C.text).text(text);
  doc.moveDown(0.3);
}

function para(doc: Doc, text: string, opts: { color?: string; size?: number } = {}) {
  doc
    .font('Helvetica')
    .fontSize(opts.size ?? 10)
    .fillColor(opts.color ?? C.text)
    .text(text);
}

function fields(doc: Doc, rows: [string, string | null | undefined][]) {
  const x = doc.page.margins.left;
  const labelWidth = 120;
  const valueWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right - labelWidth;
  for (const [label, value] of rows) {
    const y = doc.y;
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(C.muted)
      .text(label.toUpperCase(), x, y, { width: labelWidth - 8 });
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(C.text)
      .text(value || '—', x + labelWidth, y, { width: valueWidth });
    doc.moveDown(0.5);
  }
  doc.x = x;
}

function table(doc: Doc, headers: string[], rows: string[][], widths: (number | string)[]) {
  doc.font('Helvetica').fontSize(8.5).fillColor(C.text);
  doc.table({
    columnStyles: widths,
    rowStyles: (row) => (row === 0 ? { backgroundColor: C.header } : undefined),
    defaultStyle: { border: 0.5, borderColor: C.border, padding: 4 },
    data: [
      headers.map((h) => ({ text: h, type: 'TH' as const, font: { src: 'Helvetica-Bold' } })),
      ...rows,
    ],
  });
  doc.moveDown(0.5);
}

function newPage(doc: Doc, size: [number, number] = A4_PORTRAIT) {
  doc.addPage({ size, margin: MARGIN });
}

// ---------- sections ----------

function coverPage(doc: Doc, { process: p, graph: g, generatedBy, generatedAt }: PackInput) {
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(C.muted)
    .text('PROCESS PACK', { characterSpacing: 1.5 });
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(24).fillColor(C.text).text(p.name);
  doc.moveDown(0.2);
  para(doc, `${p.department.name}  ·  Version ${g.versionNumber}  ·  ${statusLabel[g.status]}`, {
    color: C.muted,
    size: 11,
  });
  if (g.description) {
    doc.moveDown(0.8);
    para(doc, g.description, { size: 11 });
  }

  heading(doc, 'Overview');
  fields(doc, [
    ['Purpose', g.purpose],
    ['Trigger', g.trigger],
    ['End condition', g.endCondition],
    ['Frequency', g.frequency],
    ['Volume', g.volume],
  ]);

  heading(doc, 'Ownership and status');
  fields(doc, [
    ['Department', p.department.name],
    ['Process owner', p.owner?.displayName],
    ['Status', statusLabel[g.status]],
    ['Version', `v${g.versionNumber}`],
    ['Last reviewed', fmtDate(g.approvedAt ?? g.validatedAt)],
    ['Generated', `${fmtDate(generatedAt.toISOString())} by ${generatedBy}`],
  ]);

  const count = (pred: (s: VersionGraph['steps'][number]) => boolean) =>
    g.steps.filter(pred).length;
  heading(doc, 'At a glance');
  fields(doc, [
    ['Steps', String(count((s) => s.type !== 'start' && s.type !== 'end'))],
    ['Decisions', String(count((s) => s.type === 'decision'))],
    ['Approvals', String(count((s) => s.type === 'approval'))],
    ['Exception paths', String(g.edges.filter((e) => e.type === 'exception').length)],
    [
      'Roles involved',
      [...new Set(g.steps.flatMap((s) => (s.actor ? [s.actor.name] : [])))].join(', '),
    ],
    ['Systems used', [...new Set(g.steps.flatMap((s) => s.systems.map((x) => x.name)))].join(', ')],
  ]);

  heading(doc, 'How to read this pack');
  para(
    doc,
    'Each step and rule shows where it came from: "Stated by employee" (described in an interview), "From SOP" (official documents), "AI inferred" (deduced by the AI and not yet confirmed), "Confirmed" (validated by the process owner) or "Disputed" (the employee and the SOP disagree). AI-inferred content is drawn with a dashed amber outline on the map.',
    { color: C.muted, size: 9.5 },
  );
}

/** Below this scale map text is too small to read on paper, so detail pages are added. */
const READABLE_SCALE = 0.62;
const MAX_DETAIL_SCALE = 0.8;
const TILE_OVERLAP = 80;

function mapPage(doc: Doc, { scene }: PackInput) {
  const [pageW, pageH] = A3_LANDSCAPE;
  const legendHeight = 28;
  const box = (top: number) => ({
    x: MARGIN,
    y: top,
    width: pageW - MARGIN * 2,
    height: pageH - top - MARGIN - legendHeight,
  });

  newPage(doc, A3_LANDSCAPE);
  doc.font('Helvetica-Bold').fontSize(14).fillColor(C.text).text('Process map');
  const overview = box(doc.y + 8);
  const scale = drawScene(doc, scene, overview);
  legend(doc, MARGIN, pageH - MARGIN - legendHeight + 10);
  if (scale >= READABLE_SCALE) return;

  // Wide process: tile it across detail pages at a readable scale (larger when the page height
  // allows), spreading the tiles evenly so the last page isn't mostly empty.
  const detailScale = Math.min(
    MAX_DETAIL_SCALE,
    Math.max(READABLE_SCALE, overview.height / scene.height),
  );
  const sliceWidth = overview.width / detailScale;
  const parts = Math.ceil((scene.width - TILE_OVERLAP) / (sliceWidth - TILE_OVERLAP));
  const step = parts > 1 ? (scene.width - sliceWidth) / (parts - 1) : 0;
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(C.muted)
    .text(
      `Overview of the whole process. Detail follows on the next ${parts} pages.`,
      MARGIN,
      overview.y - 4,
      {
        lineBreak: false,
      },
    );

  for (let i = 0; i < parts; i++) {
    newPage(doc, A3_LANDSCAPE);
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor(C.text)
      .text(`Process map — part ${i + 1} of ${parts}`);
    const detail = box(doc.y + 8);
    drawSceneSlice(doc, scene, detail, i * step, detailScale);
    legend(doc, MARGIN, pageH - MARGIN - legendHeight + 10);
  }
}

function legend(doc: Doc, x: number, y: number) {
  const items: { label: string; draw: (x: number, y: number) => void }[] = [
    ...(['sequence', 'exception', 'loop_back'] as const).map((t) => ({
      label: { sequence: 'Flow', exception: 'Exception', loop_back: 'Loop back' }[t],
      draw: (lx: number, ly: number) => {
        const st = edgeStyle[t];
        doc.lineWidth(1.5);
        if (st.dash) doc.dash(st.dash[0]!, { space: st.dash[1]! });
        else doc.undash();
        doc
          .moveTo(lx, ly)
          .lineTo(lx + 22, ly)
          .stroke(st.color);
        doc.undash();
      },
    })),
    {
      label: 'Approval',
      draw: (lx, ly) => {
        doc
          .lineWidth(0.75)
          .roundedRect(lx, ly - 5, 14, 10, 2)
          .stroke(C.border);
        doc.rect(lx, ly - 5, 3, 10).fill(palette.approval);
      },
    },
    {
      label: 'Decision',
      draw: (lx, ly) => {
        doc
          .lineWidth(1)
          .polygon([lx + 7, ly - 6], [lx + 14, ly], [lx + 7, ly + 6], [lx, ly])
          .fillAndStroke(palette.decisionFill, palette.decisionStroke);
      },
    },
    {
      label: 'AI inferred',
      draw: (lx, ly) => {
        doc
          .lineWidth(1)
          .dash(3, { space: 2 })
          .roundedRect(lx, ly - 5, 14, 10, 2)
          .stroke(palette.inferred);
        doc.undash();
      },
    },
  ];
  let cx = x;
  for (const item of items) {
    item.draw(cx, y);
    const iconWidth = 26;
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(C.muted)
      .text(item.label, cx + iconWidth, y - 4, { lineBreak: false });
    cx += iconWidth + doc.widthOfString(item.label) + 22;
  }
}

function stepsSection(doc: Doc, g: VersionGraph) {
  newPage(doc, A4_LANDSCAPE);
  heading(doc, 'Process steps');
  const steps = g.steps.filter((s) => s.type !== 'start' && s.type !== 'end');
  table(
    doc,
    ['Key', 'Step', 'Type', 'Owner', 'Systems', 'Inputs', 'Outputs', 'Duration / SLA', 'Source'],
    steps.map((s) => [
      s.stepKey,
      s.description ? `${s.name}\n${s.description}` : s.name,
      humanize(s.type) + (s.execution !== 'unknown' ? `\n${humanize(s.execution)}` : ''),
      s.actor?.name ?? '—',
      s.systems.map((x) => x.name).join(', ') || '—',
      s.inputs.join(', ') || '—',
      s.outputs.join(', ') || '—',
      [s.expectedDuration, s.sla ? `SLA ${s.sla}` : null].filter(Boolean).join('\n') || '—',
      provenanceLabel[s.provenance],
    ]),
    [32, '*', 58, 80, 72, 80, 80, 66, 62],
  );
}

function pathsSection(doc: Doc, g: VersionGraph) {
  const byId = new Map(g.steps.map((s) => [s.id, s]));
  const branching = g.steps.filter((s) => g.edges.filter((e) => e.fromStepId === s.id).length > 1);
  const exceptional = g.edges.filter((e) => e.type === 'exception' || e.type === 'loop_back');
  if (branching.length === 0 && exceptional.length === 0) return;

  heading(doc, 'Decisions, branches and exceptions');
  const rows: string[][] = [];
  for (const s of branching) {
    for (const e of g.edges.filter((x) => x.fromStepId === s.id)) {
      rows.push([
        `${s.stepKey} ${s.name}`,
        e.conditionLabel ?? '—',
        `${byId.get(e.toStepId)?.stepKey ?? ''} ${byId.get(e.toStepId)?.name ?? ''}`,
        humanize(e.type),
      ]);
    }
  }
  for (const e of exceptional) {
    if (branching.some((s) => s.id === e.fromStepId)) continue;
    const from = byId.get(e.fromStepId);
    const to = byId.get(e.toStepId);
    rows.push([
      `${from?.stepKey} ${from?.name}`,
      e.conditionLabel ?? '—',
      `${to?.stepKey} ${to?.name}`,
      humanize(e.type),
    ]);
  }
  table(doc, ['From', 'Condition', 'Goes to', 'Path type'], rows, ['*', 150, '*', 80]);
}

function rulesSection(doc: Doc, g: VersionGraph) {
  if (g.rules.length === 0) return;
  const byId = new Map(g.steps.map((s) => [s.id, s]));
  heading(doc, 'Business rules and controls');
  table(
    doc,
    ['Rule', 'Applies to', 'Type', 'Source'],
    g.rules.map((r) => {
      const step = r.stepId ? byId.get(r.stepId) : null;
      return [
        r.statement,
        step ? `${step.stepKey} ${step.name}` : 'Whole process',
        humanize(r.ruleType),
        provenanceLabel[r.provenance],
      ];
    }),
    ['*', 170, 70, 90],
  );
}

function painPointsSection(doc: Doc, g: VersionGraph) {
  const rows = g.steps.flatMap((s) => s.painPoints.map((pp) => [`${s.stepKey} ${s.name}`, pp]));
  if (rows.length === 0) return;
  heading(doc, 'Reported pain points');
  para(
    doc,
    'As described by employees. Improvement recommendations are kept separate from the current-state process.',
    {
      color: C.muted,
      size: 9,
    },
  );
  doc.moveDown(0.3);
  table(doc, ['Step', 'Pain point'], rows, [220, '*']);
}

function recommendationsSection(doc: Doc, g: VersionGraph, findings: PackInput['findings']) {
  const issues = findings?.issues.filter((i) => i.status === 'accepted') ?? [];
  const opps = findings?.opportunities.filter((o) => o.status === 'accepted') ?? [];
  if (!issues.length && !opps.length) return;
  const stepRef = (id: string | null) => {
    const s = id ? g.steps.find((x) => x.id === id) : null;
    return s ? `${s.stepKey} ${s.name}` : 'Whole process';
  };
  heading(doc, 'Recommendations');
  para(doc, 'Accepted by the process owner. These are proposals for improvement, not part of the documented current process.', {
    color: C.muted,
    size: 9,
  });
  doc.moveDown(0.3);
  if (issues.length) {
    table(
      doc,
      ['Issue', 'Step', 'Category', 'Severity'],
      issues.map((i) => [`${i.title}\n${i.description}`, stepRef(i.stepId), humanize(i.category), humanize(i.severity)]),
      ['*', 150, 90, 60],
    );
  }
  if (opps.length) {
    table(
      doc,
      ['Opportunity', 'Step', 'Type', 'Impact / effort'],
      opps.map((o) => [
        `${o.title}\n${o.description}${o.expectedBenefit ? `\nBenefit: ${o.expectedBenefit}` : ''}`,
        stepRef(o.stepId),
        o.kind === 'ai' ? 'AI' : o.kind === 'rpa' ? 'RPA' : humanize(o.kind),
        `${humanize(o.impact)} / ${humanize(o.effort)}`,
      ]),
      ['*', 150, 80, 80],
    );
  }
}

function historySection(doc: Doc, p: ProcessDetail) {
  heading(doc, 'Version history');
  table(
    doc,
    ['Version', 'Status', 'Change', 'Created', 'Validated', 'Approved'],
    p.versions.map((v) => [
      `v${v.versionNumber}`,
      statusLabel[v.status],
      v.changeSummary ?? '—',
      `${fmtDate(v.createdAt)}\n${v.createdBy?.displayName ?? ''}`,
      `${fmtDate(v.validatedAt)}\n${v.validatedBy?.displayName ?? ''}`,
      `${fmtDate(v.approvedAt)}\n${v.approvedBy?.displayName ?? ''}`,
    ]),
    [50, 80, '*', 100, 100, 100],
  );
}

/** Footer with page numbers on every page, plus a watermark when the version isn't validated. */
function decoratePages(doc: Doc, { process: p, graph: g }: PackInput) {
  const range = doc.bufferedPageRange();
  const unvalidated = g.status === 'draft' || g.status === 'under_validation';
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const { width, height } = doc.page;
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(C.muted)
      .text(
        `Process AI  ·  ${p.name}  ·  v${g.versionNumber} ${statusLabel[g.status]}`,
        MARGIN,
        height - 30,
        { lineBreak: false },
      )
      .text(`Page ${i - range.start + 1} of ${range.count}`, width - MARGIN - 80, height - 30, {
        width: 80,
        align: 'right',
        lineBreak: false,
      });
    if (unvalidated) {
      doc.save();
      doc.rotate(-30, { origin: [width / 2, height / 2] });
      doc
        .font('Helvetica-Bold')
        .fontSize(52)
        .fillColor('#dc2626')
        .fillOpacity(0.08)
        .text('DRAFT – NOT VALIDATED', 0, height / 2 - 30, {
          width,
          align: 'center',
          lineBreak: false,
        });
      doc.restore();
      doc.fillOpacity(1);
    }
    doc.page.margins.bottom = bottom;
  }
}
