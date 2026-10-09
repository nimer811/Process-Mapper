import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type {
  Control,
  DocClassification,
  ProcessDetail,
  SopWording,
  VersionGraph,
} from '@process-ai/shared';

export interface SopInput {
  docId: string;
  docVersion: string;
  /** Draft until published from an approved version. */
  status: 'draft' | 'published';
  classification: DocClassification;
  reviewCycleMonths: number;
  process: ProcessDetail;
  graph: VersionGraph;
  controls: Control[];
  wording: SopWording;
  /** Wording drafted by AI (shown with a review note while in draft). */
  aiDrafted: boolean;
  diagram: { svg: string; width: number; height: number };
  references: { title: string; category: string; docVersion: string | null }[];
  contributors: { displayName: string; department: string | null }[];
  provenance: Record<string, number>;
  generatedAt: Date;
}

const FONT = 'Arial';
const MUTED = '64748B';
const HEADER_FILL = 'E2E8F0';
/** 1×1 transparent PNG for viewers without SVG support. */
const PNG_FALLBACK = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const CLASSIFICATION: Record<DocClassification, string> = {
  public: 'Public',
  internal: 'Internal',
  confidential: 'Confidential',
  restricted: 'Restricted',
};

const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toISOString().slice(0, 10) : '—';
const addMonths = (d: Date, n: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
};
const humanize = (s: string) => {
  const t = s.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const text = (
  t: string,
  opts: { bold?: boolean; italic?: boolean; color?: string; size?: number } = {},
) => new TextRun({ text: t, font: FONT, size: opts.size ?? 20, ...opts });
const para = (
  t: string,
  opts: { bold?: boolean; italic?: boolean; color?: string; spacingAfter?: number } = {},
) => new Paragraph({ children: [text(t, opts)], spacing: { after: opts.spacingAfter ?? 120 } });
const muted = (t: string) => para(t, { italic: true, color: MUTED });
const heading = (t: string, level: 1 | 2 = 1) =>
  new Paragraph({
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    spacing: { before: level === 1 ? 320 : 200, after: 120 },
    children: [new TextRun({ text: t, font: FONT, bold: true, size: level === 1 ? 28 : 23 })],
  });
const bullets = (items: string[]) =>
  items.map(
    (i) => new Paragraph({ bullet: { level: 0 }, children: [text(i)], spacing: { after: 60 } }),
  );

const cell = (t: string, header = false, width?: number) =>
  new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: header ? { type: ShadingType.CLEAR, color: 'auto', fill: HEADER_FILL } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: t
      .split('\n')
      .map((line) => new Paragraph({ children: [text(line, { bold: header, size: 18 })] })),
  });

function table(headers: string[], rows: string[][], widths?: number[]) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => cell(h, true, widths?.[i])),
      }),
      ...rows.map(
        (r) => new TableRow({ children: r.map((c, i) => cell(c || '—', false, widths?.[i])) }),
      ),
    ],
  });
}
const keyValues = (rows: [string, string][]) =>
  table(
    ['Field', 'Value'],
    rows.map(([k, v]) => [k, v]),
    [30, 70],
  );
const gap = () => new Paragraph({ children: [], spacing: { after: 120 } });

const isWork = (t: string) => t !== 'start' && t !== 'end';

/** Builds the SOP as a Word document from the approved process map and the reviewed wording. */
export async function buildSopDocx(input: SopInput): Promise<Buffer> {
  const { graph: g, process: p, wording: w, controls } = input;
  const byId = new Map(g.steps.map((s) => [s.id, s]));
  const work = g.steps.filter((s) => isWork(s.type));
  const instruction = new Map(w.steps.map((s) => [s.stepKey, s.instruction]));
  const ruleKey = new Map(
    g.rules.map((r, i) => [
      r.id,
      `${input.docId.split('-SOP-')[0]}-R-${String(i + 1).padStart(3, '0')}`,
    ]),
  );
  const controlsFor = (stepId: string) => controls.filter((c) => c.stepIds.includes(stepId));
  const approved = [...p.versions].find((v) => v.id === g.id);
  const effective = g.approvedAt ? new Date(g.approvedAt) : null;
  const draft = input.status === 'draft';
  const aiNote = (what: string) =>
    draft && input.aiDrafted
      ? [muted(`${what} drafted by Process AI from the process map — review before publishing.`)]
      : [];
  const roles = [...new Set(work.flatMap((s) => (s.actor ? [s.actor.name] : [])))];

  // 6. RACI: R = who does it; A = the approver if the map has one, else the process owner role.
  const owner = g.ownerRole ?? p.owner?.displayName ?? 'Process owner';
  const raciRoles = [
    ...new Set([
      ...roles,
      ...work.flatMap((s) => (s.approvalAuthority ? [s.approvalAuthority] : [])),
      owner,
    ]),
  ];
  const raciRows = work.map((s) => {
    const accountable = s.approvalAuthority ?? owner;
    return [
      `${s.stepKey} ${s.name}`,
      ...raciRoles.map((r) => {
        const isR = s.actor?.name === r;
        const isA = accountable === r;
        return isR && isA ? 'A/R' : isR ? 'R' : isA ? 'A' : '';
      }),
    ];
  });

  const diagramWidth = 620;
  const scale = diagramWidth / Math.max(1, input.diagram.width);
  const diagramHeight = Math.min(820, Math.round(input.diagram.height * scale));

  const children = [
    ...(draft
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FEF3C7' },
            spacing: { after: 200 },
            children: [
              text(
                g.status === 'approved'
                  ? 'DRAFT — not yet published. Review the wording, then publish from Process AI.'
                  : `DRAFT — the process version is ${humanize(g.status).toLowerCase()}, not approved. This SOP can be published once it is approved.`,
                { bold: true, size: 18 },
              ),
            ],
          }),
        ]
      : []),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: 'Standard Operating Procedure', font: FONT, size: 22, color: MUTED }),
      ],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: p.name, font: FONT, size: 40, bold: true })],
    }),

    heading('Document control'),
    keyValues([
      ['Document ID', input.docId],
      ['Title', p.name],
      ['Version', input.docVersion],
      ['Status', draft ? 'Draft' : 'Approved'],
      ['Department', p.department.name],
      ['Process owner', [g.ownerRole, p.owner?.displayName].filter(Boolean).join(' — ') || '—'],
      ['Approved by', approved?.approvedBy?.displayName ?? '—'],
      ['Effective date', fmtDate(effective)],
      [
        'Next review',
        effective
          ? fmtDate(addMonths(effective, input.reviewCycleMonths))
          : `${input.reviewCycleMonths} months after approval`,
      ],
      ['Classification', CLASSIFICATION[input.classification]],
      ['Language', 'English (governing language)'],
      ['Source', `Process AI — ${p.name}, process version ${g.versionNumber}`],
    ]),

    heading('1. Purpose'),
    para(w.purpose),
    ...aiNote('Purpose'),

    heading('2. Scope'),
    ...bullets(
      [
        g.trigger && `Starts when: ${g.trigger}`,
        g.endCondition && `Ends when: ${g.endCondition}`,
        (g.frequency || g.volume) &&
          `Frequency / volume: ${[g.frequency, g.volume].filter(Boolean).join(', ')}`,
        ...w.scopeIn,
      ]
        .filter((x): x is string => !!x)
        .filter((x, i, a) => a.indexOf(x) === i),
    ),
    ...(w.scopeOut.length ? [para('Out of scope:', { bold: true }), ...bullets(w.scopeOut)] : []),

    heading('3. Definitions and abbreviations'),
    ...(w.definitions.length
      ? [
          table(
            ['Term', 'Meaning'],
            w.definitions.map((d) => [d.term, d.meaning]),
            [30, 70],
          ),
        ]
      : [muted('Not applicable — no specialised terms.')]),

    heading('4. References'),
    ...(input.references.length
      ? [
          table(
            ['Document', 'Type', 'Version'],
            input.references.map((r) => [r.title, humanize(r.category), r.docVersion ?? '—']),
            [60, 25, 15],
          ),
        ]
      : [muted('No linked documents in the knowledge base.')]),

    heading('5. Roles and responsibilities'),
    table(
      ['Role', 'Responsibilities', 'Authority'],
      roles.map((r) => [
        r,
        w.roles.find((x) => x.role.toLowerCase() === r.toLowerCase())?.responsibilities ??
          `Performs: ${work
            .filter((s) => s.actor?.name === r)
            .map((s) => s.name)
            .join('; ')}.`,
        work
          .filter((s) => s.actor?.name === r && s.approvalAuthority)
          .map((s) => s.approvalAuthority)
          .join('; '),
      ]),
      [22, 58, 20],
    ),
    ...aiNote('Responsibilities'),

    heading('6. RACI matrix'),
    table(['Activity', ...raciRoles], raciRows),
    muted('R = responsible, A = accountable. Consulted and informed roles are not captured yet.'),

    heading('7. Process overview'),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({
          type: 'svg',
          data: Buffer.from(input.diagram.svg),
          transformation: { width: diagramWidth, height: diagramHeight },
          fallback: { type: 'png', data: PNG_FALLBACK },
        }),
      ],
    }),
    gap(),
    table(
      ['Step', 'Name', 'Role', 'System', 'SLA'],
      work.map((s) => [
        s.stepKey,
        s.name,
        s.actor?.name ?? '',
        s.systems.map((x) => x.name).join(', '),
        s.sla ?? '',
      ]),
      [10, 36, 22, 20, 12],
    ),

    heading('8. Detailed procedure'),
    ...(g.trigger ? [para(`Trigger: ${g.trigger}`, { italic: true })] : []),
    ...work.flatMap((s) => {
      const next = g.edges
        .filter((e) => e.fromStepId === s.id)
        .map(
          (e) =>
            `${e.conditionLabel ? `If ${e.conditionLabel}: ` : ''}${byId.get(e.toStepId)?.stepKey ?? ''} ${byId.get(e.toStepId)?.name ?? ''}`,
        );
      const rules = g.rules.filter((r) => r.stepId === s.id);
      return [
        heading(`${s.stepKey} — ${s.name}`, 2),
        para(instruction.get(s.stepKey) ?? `${s.name}.`),
        table(
          ['Item', 'Detail'],
          (
            [
              ['Type', humanize(s.type)],
              ['Role', s.actor?.name ?? ''],
              ['System(s)', s.systems.map((x) => x.name).join(', ')],
              ['Execution', s.execution === 'unknown' ? '' : humanize(s.execution)],
              ['Inputs', s.inputs.join(', ')],
              ['Outputs / records', s.outputs.join(', ')],
              ['Expected duration', s.expectedDuration ?? ''],
              ['SLA', s.sla ?? ''],
              ['Approver', s.approvalAuthority ?? ''],
              [
                'Controls',
                controlsFor(s.id)
                  .map((c) => `${c.controlKey} ${c.name}`)
                  .join('\n'),
              ],
              ['Rules', rules.map((r) => `${ruleKey.get(r.id)} ${r.statement}`).join('\n')],
              ['Next', next.join('\n')],
            ] as [string, string][]
          ).filter(([, v]) => v),
          [25, 75],
        ),
      ];
    }),
    ...(g.endCondition ? [para(`End: ${g.endCondition}`, { italic: true })] : []),
    ...aiNote('Step instructions'),

    heading('9. Decision criteria'),
    ...(() => {
      const decisions = g.steps.filter((s) => s.type === 'decision' || s.type === 'approval');
      if (!decisions.length) return [muted('Not applicable — no decisions in this process.')];
      return [
        table(
          ['Decision', 'Outcome / criteria', 'Next step'],
          decisions.flatMap((s) => {
            const out = g.edges.filter((e) => e.fromStepId === s.id);
            return (out.length ? out : [null]).map((e) => [
              `${s.stepKey} ${s.name}`,
              e?.conditionLabel ?? (e ? 'Otherwise' : ''),
              e ? `${byId.get(e.toStepId)?.stepKey} ${byId.get(e.toStepId)?.name}` : '',
            ]);
          }),
          [35, 35, 30],
        ),
        ...(g.rules.some((r) => r.ruleType === 'threshold' || r.ruleType === 'approval')
          ? [
              gap(),
              para('Thresholds and approval rules:', { bold: true }),
              ...bullets(
                g.rules
                  .filter((r) => r.ruleType === 'threshold' || r.ruleType === 'approval')
                  .map((r) => `${ruleKey.get(r.id)} ${r.statement}`),
              ),
            ]
          : []),
      ];
    })(),

    heading('10. Exceptions and escalation'),
    ...(w.exceptions.length
      ? [
          table(
            ['Exception', 'How it is detected', 'Handling', 'Escalation'],
            w.exceptions.map((e) => [e.exception, e.detection, e.handling, e.escalation]),
            [25, 25, 30, 20],
          ),
          ...aiNote('Exceptions'),
        ]
      : [muted('No exceptions recorded.')]),

    heading('11. Business rules and controls'),
    heading('11.1 Control matrix', 2),
    ...(controls.length
      ? [
          table(
            ['ID', 'Control', 'Type', 'Owner', 'Frequency', 'Evidence', 'Steps', 'Key'],
            controls.map((c) => [
              c.controlKey,
              `${c.name}${c.description ? `\n${c.description}` : ''}${c.provenance === 'inferred' ? '\n(AI drafted — not confirmed)' : ''}`,
              `${humanize(c.controlType)}, ${humanize(c.mode)}`,
              c.ownerRole ?? '',
              c.frequency ?? '',
              c.evidence ?? '',
              c.stepIds
                .map((id) => byId.get(id)?.stepKey)
                .filter(Boolean)
                .join(', '),
              c.isKey ? 'Yes' : '',
            ]),
            [10, 28, 12, 12, 10, 14, 8, 6],
          ),
        ]
      : [muted('No controls recorded. Add them on the Controls tab in Process AI.')]),
    heading('11.2 Business rules', 2),
    ...(g.rules.length
      ? [
          table(
            ['ID', 'Rule', 'Type', 'Applies to'],
            g.rules.map((r) => [
              ruleKey.get(r.id)!,
              r.statement,
              humanize(r.ruleType),
              r.stepId
                ? `${byId.get(r.stepId)?.stepKey} ${byId.get(r.stepId)?.name}`
                : 'Whole process',
            ]),
            [13, 52, 13, 22],
          ),
        ]
      : [muted('No business rules recorded.')]),

    heading('12. KPIs and SLAs'),
    ...(work.some((s) => s.sla || s.expectedDuration)
      ? [
          table(
            ['Step', 'Expected duration', 'SLA'],
            work
              .filter((s) => s.sla || s.expectedDuration)
              .map((s) => [`${s.stepKey} ${s.name}`, s.expectedDuration ?? '', s.sla ?? '']),
            [50, 25, 25],
          ),
        ]
      : [muted('No step timings recorded.')]),
    muted('Process-level KPIs (formula, target, owner) are to be defined by the process owner.'),

    heading('13. Records and retention'),
    ...(work.some((s) => s.outputs.length)
      ? [
          table(
            ['Record', 'Created at', 'Where kept', 'Retention'],
            work.flatMap((s) =>
              s.outputs.map((o) => [
                o,
                `${s.stepKey} ${s.name}`,
                s.systems.map((x) => x.name).join(', '),
                '5 years (default)',
              ]),
            ),
            [30, 30, 20, 20],
          ),
          muted(
            'Default retention follows UAE commercial record-keeping (at least 5 years); confirm with the records policy.',
          ),
        ]
      : [muted('No records captured as step outputs.')]),

    heading('14. Risks'),
    ...(w.risks.length
      ? [
          table(
            ['Risk', 'Cause', 'Impact', 'Mitigating controls'],
            w.risks.map((r) => [r.risk, r.cause, r.impact, r.controls.join(', ')]),
            [30, 25, 25, 20],
          ),
          ...aiNote('Risks'),
        ]
      : [muted('No risks recorded.')]),

    heading('15. Training and competence'),
    ...(w.training.length
      ? [
          table(
            ['Role', 'Training'],
            w.training.map((t) => [t.role, t.training]),
            [30, 70],
          ),
          ...aiNote('Training suggestions'),
        ]
      : [muted('To be defined by the process owner.')]),

    heading('16. Evidence and provenance'),
    para(
      `This SOP was generated from the process map in Process AI. People who described the process: ${
        input.contributors
          .map((c) => `${c.displayName}${c.department ? ` (${c.department})` : ''}`)
          .join(', ') || '—'
      }.`,
    ),
    table(
      ['Source', 'Elements'],
      Object.entries(input.provenance).map(([k, n]) => [humanize(k), String(n)]),
      [60, 40],
    ),

    heading('17. Revision history'),
    table(
      ['Version', 'Date', 'Status', 'Summary of changes'],
      [...p.versions]
        .filter((v) => v.kind === 'as_is' && v.versionNumber <= g.versionNumber)
        .sort((a, b) => a.versionNumber - b.versionNumber)
        .map((v) => [
          `${v.versionNumber}.0`,
          fmtDate(v.approvedAt ?? v.validatedAt ?? v.createdAt),
          humanize(v.status),
          v.changeSummary ?? '',
        ]),
      [12, 18, 18, 52],
    ),

    heading('18. Approval and sign-off'),
    table(
      ['Role', 'Name', 'Date'],
      [
        [
          'Prepared by (interviews)',
          input.contributors.map((c) => c.displayName).join(', '),
          fmtDate(g.createdAt),
        ],
        [
          'Validated by (process owner)',
          approved?.validatedBy?.displayName ?? '',
          fmtDate(g.validatedAt),
        ],
        ['Approved by', approved?.approvedBy?.displayName ?? '', fmtDate(g.approvedAt)],
      ],
      [35, 40, 25],
    ),
    gap(),
    muted(`Generated by Process AI on ${fmtDate(input.generatedAt)}.`),
  ];

  const headerText = `${input.docId} · ${p.name} · v${input.docVersion} · ${CLASSIFICATION[input.classification]}`;
  const doc = new Document({
    creator: 'Process AI',
    title: `${input.docId} ${p.name}`,
    description: `Standard Operating Procedure — ${p.name}`,
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1100, bottom: 1100, left: 1000, right: 1000 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [text(headerText, { color: MUTED, size: 16 })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  text(
                    `Uncontrolled when printed — check the current version in Process AI · Effective ${fmtDate(effective)} · Page `,
                    { color: MUTED, size: 16 },
                  ),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FONT,
                    size: 16,
                    color: MUTED,
                  }),
                  text(' of ', { color: MUTED, size: 16 }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: FONT,
                    size: 16,
                    color: MUTED,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
