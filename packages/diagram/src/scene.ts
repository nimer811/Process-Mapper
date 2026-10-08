import type { EdgeType, ProcessStep, Provenance } from '@process-ai/shared';
import { arrowHead, labelPoint, roundedPath, trimEnd, truncate, wrapText } from './geometry.js';
import { NODE_SIZE, type DiagramGraph, type GraphLayout, type Point } from './layout.js';

/** Renderer-neutral drawing primitives. SVG and PDF backends draw the same scene. */
export type Shape =
  | {
      kind: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      r: number;
      fill: string;
      stroke: string;
      strokeWidth: number;
      dash?: number[];
    }
  | {
      kind: 'polygon';
      points: Point[];
      fill: string;
      stroke: string;
      strokeWidth: number;
      dash?: number[];
    }
  | { kind: 'path'; d: string; stroke: string; strokeWidth: number; dash?: number[] }
  | {
      kind: 'text';
      x: number;
      y: number;
      text: string;
      size: number;
      bold?: boolean;
      color: string;
      anchor: 'start' | 'middle';
    };

export interface Scene {
  width: number;
  height: number;
  shapes: Shape[];
}

export const palette = {
  text: '#0f172a',
  muted: '#64748b',
  card: '#ffffff',
  border: '#cbd5e1',
  approval: '#f59e0b',
  inferred: '#f59e0b',
  disputed: '#ef4444',
  decisionFill: '#f0f9ff',
  decisionStroke: '#0ea5e9',
  startFill: '#ecfdf5',
  startStroke: '#10b981',
  endFill: '#f1f5f9',
  endStroke: '#334155',
  labelBg: '#ffffff',
} as const;

export const edgeStyle: Record<EdgeType, { color: string; dash?: number[] }> = {
  sequence: { color: '#64748b' },
  branch: { color: '#64748b' },
  alternate: { color: '#64748b', dash: [2, 4] },
  exception: { color: '#dc2626', dash: [6, 4] },
  loop_back: { color: '#0284c7', dash: [4, 4] },
};

const PAD = 24;
const ARROW = 9;

function provenanceStroke(p: Provenance, fallback: string): { stroke: string; dash?: number[] } {
  if (p === 'inferred') return { stroke: palette.inferred, dash: [5, 3] };
  if (p === 'disputed') return { stroke: palette.disputed, dash: [5, 3] };
  return { stroke: fallback };
}

function stepShapes(step: ProcessStep, at: Point): Shape[] {
  const { width: w, height: h } = NODE_SIZE[step.type];
  const x = at.x + PAD;
  const y = at.y + PAD;
  const cx = x + w / 2;
  const cy = y + h / 2;

  if (step.type === 'decision') {
    const s = provenanceStroke(step.provenance, palette.decisionStroke);
    const lines = wrapText(step.name, 16, 3);
    return [
      {
        kind: 'polygon',
        points: [
          { x: cx, y },
          { x: x + w, y: cy },
          { x: cx, y: y + h },
          { x, y: cy },
        ],
        fill: palette.decisionFill,
        strokeWidth: 2,
        ...s,
      },
      ...lines.map((t, i): Shape => ({
        kind: 'text',
        x: cx,
        y: cy + (i - (lines.length - 1) / 2) * 13 + 4,
        text: t,
        size: 10.5,
        bold: true,
        color: palette.text,
        anchor: 'middle',
      })),
    ];
  }

  if (step.type === 'start' || step.type === 'end') {
    const isStart = step.type === 'start';
    const s = provenanceStroke(step.provenance, isStart ? palette.startStroke : palette.endStroke);
    const lines = wrapText(step.name, 26, 2);
    return [
      {
        kind: 'rect',
        x,
        y,
        w,
        h,
        r: h / 2,
        fill: isStart ? palette.startFill : palette.endFill,
        strokeWidth: 2,
        ...s,
      },
      ...lines.map((t, i): Shape => ({
        kind: 'text',
        x: cx,
        y: cy + (i - (lines.length - 1) / 2) * 13 + 4,
        text: t,
        size: 11,
        bold: true,
        color: palette.text,
        anchor: 'middle',
      })),
    ];
  }

  const isApproval = step.type === 'approval';
  const s = provenanceStroke(step.provenance, palette.border);
  const header = `${step.stepKey} · ${isApproval ? 'APPROVAL' : step.type === 'subprocess' ? 'SUBPROCESS' : 'TASK'}`;
  const nameLines = wrapText(step.name, 32, 2);
  const footer = [
    step.actor ? truncate(step.actor.name, 22) : null,
    step.systems[0]
      ? truncate(step.systems[0].name, 18) +
        (step.systems.length > 1 ? ` +${step.systems.length - 1}` : '')
      : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  const shapes: Shape[] = [
    { kind: 'rect', x, y, w, h, r: 8, fill: palette.card, strokeWidth: 1, ...s },
  ];
  if (isApproval) {
    shapes.push({
      kind: 'rect',
      x,
      y,
      w: 4,
      h,
      r: 2,
      fill: palette.approval,
      stroke: palette.approval,
      strokeWidth: 0,
    });
  }
  shapes.push({
    kind: 'text',
    x: x + 12,
    y: y + 17,
    text: header,
    size: 8.5,
    color: palette.muted,
    anchor: 'start',
  });
  nameLines.forEach((t, i) =>
    shapes.push({
      kind: 'text',
      x: x + 12,
      y: y + 38 + i * 15,
      text: t,
      size: 12,
      bold: true,
      color: palette.text,
      anchor: 'start',
    }),
  );
  if (footer) {
    shapes.push({
      kind: 'text',
      x: x + 12,
      y: y + h - 11,
      text: footer,
      size: 9.5,
      color: palette.muted,
      anchor: 'start',
    });
  }
  return shapes;
}

/** Builds a printable scene of the process map from a computed layout. */
export function buildScene(graph: DiagramGraph, layout: GraphLayout): Scene {
  const shapes: Shape[] = [];
  const labels: Shape[] = [];
  const shift = (p: Point) => ({ x: p.x + PAD, y: p.y + PAD });

  for (const e of graph.edges) {
    const route = layout.routes.get(e.id);
    if (!route || route.length < 2) continue;
    const pts = route.map(shift);
    const style = edgeStyle[e.type];
    shapes.push({
      kind: 'path',
      d: roundedPath(trimEnd(pts, ARROW - 1)),
      stroke: style.color,
      strokeWidth: 1.5,
      dash: style.dash,
    });
    shapes.push({
      kind: 'polygon',
      points: arrowHead(pts, ARROW),
      fill: style.color,
      stroke: style.color,
      strokeWidth: 0,
    });
    if (e.conditionLabel) {
      const at = labelPoint(pts);
      const w = e.conditionLabel.length * 5.4 + 12;
      labels.push(
        {
          kind: 'rect',
          x: at.x - w / 2,
          y: at.y - 8,
          w,
          h: 16,
          r: 3,
          fill: palette.labelBg,
          stroke: palette.border,
          strokeWidth: 0.75,
        },
        {
          kind: 'text',
          x: at.x,
          y: at.y + 3.5,
          text: e.conditionLabel,
          size: 9.5,
          color: palette.text,
          anchor: 'middle',
        },
      );
    }
  }

  for (const step of graph.steps) {
    const at = layout.positions.get(step.id);
    if (at) shapes.push(...stepShapes(step, at));
  }

  // Labels last so they're never hidden under nodes or other edges.
  shapes.push(...labels);
  return { width: layout.width + PAD * 2, height: layout.height + PAD * 2, shapes };
}
