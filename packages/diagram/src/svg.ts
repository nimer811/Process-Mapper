import type { Scene, Shape } from './scene.js';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const n = (v: number) => Math.round(v * 100) / 100;
const dashAttr = (dash?: number[]) => (dash ? ` stroke-dasharray="${dash.join(' ')}"` : '');

function shapeToSvg(s: Shape): string {
  switch (s.kind) {
    case 'rect':
      return `<rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}" rx="${n(s.r)}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"${dashAttr(s.dash)}/>`;
    case 'polygon':
      return `<polygon points="${s.points.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"${dashAttr(s.dash)}/>`;
    case 'path':
      return `<path d="${s.d}" fill="none" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"${dashAttr(s.dash)}/>`;
    case 'text':
      return `<text x="${n(s.x)}" y="${n(s.y)}" font-size="${s.size}"${s.bold ? ' font-weight="bold"' : ''} fill="${s.color}" text-anchor="${s.anchor}">${esc(s.text)}</text>`;
  }
}

/** Standalone SVG document (no external CSS or fonts), suitable for PowerPoint, Visio or browsers. */
export function sceneToSvg(scene: Scene, title: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(scene.width)}" height="${n(scene.height)}" viewBox="0 0 ${n(scene.width)} ${n(scene.height)}" font-family="Helvetica, Arial, sans-serif">`,
    `<title>${esc(title)}</title>`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    ...scene.shapes.map(shapeToSvg),
    '</svg>',
  ].join('\n');
}
