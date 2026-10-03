import { strToU8, zipSync, type Zippable } from 'fflate';
import { renderProcessSvg } from '@process-ai/diagram';
import type { Db } from '@process-ai/db';
import type { CurrentUser } from '@process-ai/shared';
import { getProcess, getVersionGraph, listProcesses } from '../processes/service.js';
import { buildProcessPackPdf, packFileBase } from './process-pack-pdf.js';
import { listFindings } from '../analysis/service.js';

/** Everything needed to export one version, or null if the user can't see it. */
async function loadVersion(db: Db, user: CurrentUser, versionId: string) {
  const graph = await getVersionGraph(db, user, versionId);
  if (!graph) return null;
  const process = await getProcess(db, user, graph.processId);
  if (!process) return null;
  const { scene, svg } = await renderProcessSvg(graph, `${process.name} — v${graph.versionNumber}`);
  const findings = await listFindings(db, graph.id);
  return { process, graph, scene, svg, findings, fileBase: packFileBase(process, graph) };
}

export async function exportMapSvg(db: Db, user: CurrentUser, versionId: string) {
  const v = await loadVersion(db, user, versionId);
  return v && { filename: `${v.fileBase}-map.svg`, body: v.svg };
}

export async function exportProcessPack(db: Db, user: CurrentUser, versionId: string) {
  const v = await loadVersion(db, user, versionId);
  if (!v) return null;
  const body = await buildProcessPackPdf({
    ...v,
    generatedBy: user.displayName,
    generatedAt: new Date(),
  });
  return { filename: `${v.fileBase}-process-pack.pdf`, body };
}

const csvCell = (v: string | number | null | undefined) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * ZIP of every process in a department the user can see (its default version):
 * <slug>/<slug>-vN-process-pack.pdf, <slug>/<slug>-vN-map.svg, plus index.csv.
 */
export async function exportDepartmentPack(db: Db, user: CurrentUser, departmentSlug: string) {
  const items = await listProcesses(db, user, { department: departmentSlug });
  if (items.length === 0) return null;

  const files: Zippable = {};
  const index = [['Process', 'Status', 'Version', 'Owner', 'Steps', 'Last reviewed', 'Folder']];
  const generatedAt = new Date();

  for (const item of items) {
    const v = await loadVersion(db, user, item.versionId);
    if (!v) continue;
    const pdf = await buildProcessPackPdf({ ...v, generatedBy: user.displayName, generatedAt });
    files[`${item.slug}/${v.fileBase}-process-pack.pdf`] = [new Uint8Array(pdf), { level: 0 }];
    files[`${item.slug}/${v.fileBase}-map.svg`] = strToU8(v.svg);
    index.push([
      item.name,
      item.status,
      `v${item.versionNumber}`,
      item.owner?.displayName ?? '',
      String(item.stepCount),
      item.lastReviewedAt?.slice(0, 10) ?? '',
      item.slug,
    ]);
  }
  // Byte-order mark so Excel opens the CSV as UTF-8.
  const BOM = String.fromCharCode(0xfeff);
  files['index.csv'] = strToU8(
    `${BOM}${index.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`,
  );

  const date = generatedAt.toISOString().slice(0, 10);
  return {
    filename: `${departmentSlug}-process-pack-${date}.zip`,
    body: Buffer.from(zipSync(files, { level: 6 })),
  };
}
