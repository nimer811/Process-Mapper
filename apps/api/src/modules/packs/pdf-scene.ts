import type { Scene, Shape } from '@process-ai/diagram';

type Doc = PDFKit.PDFDocument;

/** Helvetica ascender: converts an SVG baseline y into PDFKit's top-of-line y. */
const ASCENT = 0.718;

function applyStroke(doc: Doc, width: number, dash?: number[]) {
  doc.lineWidth(width);
  if (dash) doc.dash(dash[0]!, { space: dash[1] ?? dash[0]! });
  else doc.undash();
}

function draw(doc: Doc, s: Shape) {
  switch (s.kind) {
    case 'rect':
      doc.roundedRect(s.x, s.y, s.w, s.h, s.r);
      if (s.strokeWidth > 0) {
        applyStroke(doc, s.strokeWidth, s.dash);
        doc.fillAndStroke(s.fill, s.stroke);
      } else {
        doc.fill(s.fill);
      }
      return;
    case 'polygon':
      doc.polygon(...s.points.map((p): [number, number] => [p.x, p.y]));
      if (s.strokeWidth > 0) {
        applyStroke(doc, s.strokeWidth, s.dash);
        doc.fillAndStroke(s.fill, s.stroke);
      } else {
        doc.fill(s.fill);
      }
      return;
    case 'path':
      applyStroke(doc, s.strokeWidth, s.dash);
      doc.path(s.d).stroke(s.stroke);
      return;
    case 'text': {
      doc
        .font(s.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(s.size)
        .fillColor(s.color);
      const width = doc.widthOfString(s.text);
      const x = s.anchor === 'middle' ? s.x - width / 2 : s.x;
      doc.text(s.text, x, s.y - s.size * ASCENT, { lineBreak: false });
      return;
    }
  }
}

type Box = { x: number; y: number; width: number; height: number };

/** Draws the whole scene into the box, scaled to fit (never enlarged) and centred. */
export function drawScene(doc: Doc, scene: Scene, box: Box) {
  const scale = Math.min(box.width / scene.width, box.height / scene.height, 1);
  const offsetX = box.x + (box.width - scene.width * scale) / 2;
  const offsetY = box.y + (box.height - scene.height * scale) / 2;
  doc.save();
  doc.translate(offsetX, offsetY);
  doc.scale(scale);
  for (const shape of scene.shapes) draw(doc, shape);
  doc.restore();
  doc.undash();
  return scale;
}

/**
 * Draws one horizontal slice of the scene (from sceneX, width box.width / scale) at a fixed scale,
 * clipped to the box. Used to tile a wide map across several pages at a readable size.
 */
export function drawSceneSlice(doc: Doc, scene: Scene, box: Box, sceneX: number, scale: number) {
  const offsetY = box.y + Math.max(0, (box.height - scene.height * scale) / 2);
  doc.save();
  doc.rect(box.x, box.y, box.width, box.height).clip();
  doc.translate(box.x - sceneX * scale, offsetY);
  doc.scale(scale);
  for (const shape of scene.shapes) draw(doc, shape);
  doc.restore();
  doc.undash();
}
