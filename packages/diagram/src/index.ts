export * from './layout.js';
export * from './geometry.js';
export * from './scene.js';
export * from './svg.js';

import { layoutGraph, type DiagramGraph } from './layout.js';
import { buildScene } from './scene.js';
import { sceneToSvg } from './svg.js';

/** One call from process graph to standalone SVG. */
export async function renderProcessSvg(graph: DiagramGraph, title: string) {
  const scene = buildScene(graph, await layoutGraph(graph));
  return { scene, svg: sceneToSvg(scene, title) };
}
