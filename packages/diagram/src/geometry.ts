import type { Point } from './layout.js';

const RADIUS = 8;

export const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

const towards = (from: Point, to: Point, d: number) => {
  const len = dist(from, to) || 1;
  return { x: from.x + ((to.x - from.x) / len) * d, y: from.y + ((to.y - from.y) / len) * d };
};

/** SVG path through orthogonal points, with softly rounded corners. */
export function roundedPath(points: Point[]) {
  if (points.length < 2) return '';
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const next = points[i + 1]!;
    const r = Math.min(RADIUS, dist(prev, cur) / 2, dist(cur, next) / 2);
    const a = towards(cur, prev, r);
    const b = towards(cur, next, r);
    d += ` L ${a.x} ${a.y} Q ${cur.x} ${cur.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1]!;
  return `${d} L ${last.x} ${last.y}`;
}

/**
 * Label sits mid-way along the edge's longest horizontal run: the part that unambiguously
 * belongs to this edge, with room for text. Falls back to the longest segment.
 */
export function labelPoint(points: Point[]): Point {
  let best: { a: Point; b: Point; score: number } | null = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const horizontal = Math.abs(a.y - b.y) < 1;
    const score = dist(a, b) + (horizontal ? 10_000 : 0);
    if (!best || score > best.score) best = { a, b, score };
  }
  if (!best) return points[0] ?? { x: 0, y: 0 };
  return { x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2 };
}

/** Arrowhead triangle at the end of a polyline, pointing along the last segment. */
export function arrowHead(points: Point[], size = 9): Point[] {
  const tip = points[points.length - 1]!;
  const from = points[points.length - 2] ?? tip;
  const len = dist(from, tip) || 1;
  const ux = (tip.x - from.x) / len;
  const uy = (tip.y - from.y) / len;
  const base = { x: tip.x - ux * size, y: tip.y - uy * size };
  const half = size * 0.55;
  return [tip, { x: base.x - uy * half, y: base.y + ux * half }, { x: base.x + uy * half, y: base.y - ux * half }];
}

/** Shortens a polyline's last segment so the arrowhead tip lands exactly on the node border. */
export function trimEnd(points: Point[], by: number): Point[] {
  if (points.length < 2) return points;
  const out = points.slice();
  const tip = out[out.length - 1]!;
  const from = out[out.length - 2]!;
  const len = dist(from, tip);
  if (len <= by) return out;
  out[out.length - 1] = { x: tip.x - ((tip.x - from.x) / len) * by, y: tip.y - ((tip.y - from.y) / len) * by };
  return out;
}

/** Greedy word wrap by character budget, with an ellipsis when text exceeds maxLines. */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length <= maxChars) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = w.length > maxChars ? `${w.slice(0, maxChars - 1)}…` : w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1]!;
    kept[maxLines - 1] = `${last.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
    return kept;
  }
  return lines;
}

export const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
