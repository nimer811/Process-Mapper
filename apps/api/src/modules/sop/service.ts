import { createHash, randomUUID } from 'node:crypto';
import {
  and,
  departments,
  documents,
  eq,
  knowledgeBases,
  processes,
  processVersions,
  sopDocuments,
  sql,
  users,
  type Db,
} from '@process-ai/db';
import type { CurrentUser, SopDocument, SopState, SopWording } from '@process-ai/shared';
import { draftSopWording, plainSopWording, type LlmGateway } from '@process-ai/agent';
import { renderProcessSvg } from '@process-ai/diagram';
import type { FileStore } from '@process-ai/knowledge';
import type { JobQueue } from '../../lib/jobs.js';
import { getProcess, getVersionGraph } from '../processes/service.js';
import { documentsForProcess, listDocuments } from '../knowledge/service.js';
import { listContributors } from '../contributions/service.js';
import { deptCode, listControls } from '../governance/controls.js';
import { GovernanceError, type VersionContext } from '../governance/service.js';
import { buildSopDocx } from './sop-docx.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Document types worth listing as SOP references. */
const REFERENCE_CATEGORIES = new Set([
  'policy',
  'doa',
  'approval_matrix',
  'sop',
  'form',
  'checklist',
]);

/**
 * The department's knowledge base: the one linked to the department, or else one named after it
 * (e.g. "Procurement") so an unlinked container still works.
 */
async function departmentKnowledgeBase(db: Db, departmentId: string) {
  const linked = await db.query.knowledgeBases.findFirst({
    where: and(eq(knowledgeBases.departmentId, departmentId), eq(knowledgeBases.isActive, true)),
  });
  if (linked) return linked;
  const dept = await db.query.departments.findFirst({ where: eq(departments.id, departmentId) });
  return (
    (await db.query.knowledgeBases.findFirst({
      where: and(
        sql`lower(${knowledgeBases.name}) = lower(${dept?.name ?? ''})`,
        eq(knowledgeBases.isActive, true),
      ),
    })) ?? null
  );
}

const canManage = (ctx: VersionContext) =>
  !ctx.process.archivedAt && (ctx.actor.isAdmin || ctx.actor.isOwner);

async function sopRow(db: Db, versionId: string) {
  const [row] = await db
    .select({ sop: sopDocuments, generatedBy: users.displayName })
    .from(sopDocuments)
    .leftJoin(users, eq(users.id, sopDocuments.generatedBy))
    .where(eq(sopDocuments.versionId, versionId));
  return row ?? null;
}

async function toSop(db: Db, versionId: string): Promise<SopDocument | null> {
  const row = await sopRow(db, versionId);
  if (!row) return null;
  const { sop: s } = row;
  const [proc] = await db
    .select({
      classification: processes.classification,
      reviewCycleMonths: processes.reviewCycleMonths,
    })
    .from(processVersions)
    .innerJoin(processes, eq(processes.id, processVersions.processId))
    .where(eq(processVersions.id, versionId));
  return {
    id: s.id,
    versionId: s.versionId,
    docId: s.docId,
    docVersion: s.docVersion,
    status: s.status,
    classification: proc!.classification,
    reviewCycleMonths: proc!.reviewCycleMonths,
    wording: s.wording,
    aiDrafted: s.aiDrafted,
    generatedAt: s.generatedAt.toISOString(),
    generatedBy: row.generatedBy,
    publishedAt: s.publishedAt?.toISOString() ?? null,
    knowledgeDocumentId: s.knowledgeDocumentId,
  };
}

export async function sopState(db: Db, ctx: VersionContext): Promise<SopState> {
  const sop = await toSop(db, ctx.version.id);
  const manage = canManage(ctx);
  const approved = ctx.version.status === 'approved';
  return {
    sop,
    canGenerate: manage && sop?.status !== 'published',
    canPublish: manage && approved && !!sop && sop.status === 'draft',
    publishBlockedReason: !sop
      ? 'Generate the SOP first.'
      : sop.status === 'published'
        ? 'Already published.'
        : !approved
          ? 'The SOP can be published once this process version is approved.'
          : !manage
            ? 'Only the process owner or an admin can publish.'
            : null,
  };
}

/** The process's SOP number in its department, assigned the first time an SOP is generated. */
async function sopNumberFor(db: Db, processId: string, departmentId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`sop:${departmentId}`}))`);
    const proc = await tx.query.processes.findFirst({ where: eq(processes.id, processId) });
    if (proc!.sopNumber) return proc!.sopNumber;
    const [row] = await tx
      .select({ max: sql<number>`coalesce(max(${processes.sopNumber}), 0)` })
      .from(processes)
      .where(eq(processes.departmentId, departmentId));
    const next = Number(row?.max ?? 0) + 1;
    await tx.update(processes).set({ sopNumber: next }).where(eq(processes.id, processId));
    return next;
  });
}

/** Drafts (or re-drafts) the SOP for a version: numbering, plus wording from the AI (or the map alone). */
export async function generateSop(
  db: Db,
  llm: LlmGateway | null,
  user: CurrentUser,
  ctx: VersionContext,
  orgCode: string,
  log: { warn(obj: object, msg: string): void },
) {
  if (!canManage(ctx))
    throw new GovernanceError(403, 'Only the process owner or an admin can generate the SOP');
  const existing = await sopRow(db, ctx.version.id);
  if (existing?.sop.status === 'published')
    throw new GovernanceError(
      409,
      'This SOP is published. Start a new version of the process to change it.',
    );
  const graph = (await getVersionGraph(db, user, ctx.version.id))!;
  const dept = (await db.query.departments.findFirst({
    where: eq(departments.id, ctx.process.departmentId),
  }))!;
  const number = await sopNumberFor(db, ctx.process.id, dept.id);
  const docId = `${orgCode}-${deptCode(dept.slug)}-SOP-${String(number).padStart(3, '0')}`;
  const controls = await listControls(db, ctx.version.id);

  let wording: SopWording;
  let aiDrafted = false;
  if (llm) {
    try {
      wording = await draftSopWording(llm, { processName: ctx.process.name, graph, controls });
      aiDrafted = true;
    } catch (err) {
      log.warn({ err }, 'SOP wording failed; using the map only');
      wording = plainSopWording(ctx.process.name, graph);
    }
  } else {
    wording = plainSopWording(ctx.process.name, graph);
  }

  const values = {
    versionId: ctx.version.id,
    docId,
    docVersion: `${graph.versionNumber}.0`,
    status: 'draft' as const,
    wording,
    aiDrafted,
    generatedBy: user.id,
    generatedAt: new Date(),
  };
  await db
    .insert(sopDocuments)
    .values(values)
    .onConflictDoUpdate({ target: sopDocuments.versionId, set: values });
  return (await toSop(db, ctx.version.id))!;
}

/** The owner edits the wording (or document settings) before publishing. */
export async function patchSop(
  db: Db,
  ctx: VersionContext,
  patch: {
    classification?: SopDocument['classification'];
    reviewCycleMonths?: number;
    wording?: SopWording;
  },
) {
  if (!canManage(ctx))
    throw new GovernanceError(403, 'Only the process owner or an admin can edit the SOP');
  const row = await sopRow(db, ctx.version.id);
  if (!row) throw new GovernanceError(404, 'Generate the SOP first');
  if (row.sop.status === 'published')
    throw new GovernanceError(409, 'This SOP is already published');
  if (patch.wording)
    await db
      .update(sopDocuments)
      .set({ wording: patch.wording })
      .where(eq(sopDocuments.id, row.sop.id));
  if (patch.classification || patch.reviewCycleMonths) {
    await db
      .update(processes)
      .set({
        ...(patch.classification ? { classification: patch.classification } : {}),
        ...(patch.reviewCycleMonths ? { reviewCycleMonths: patch.reviewCycleMonths } : {}),
      })
      .where(eq(processes.id, ctx.process.id));
  }
  return (await toSop(db, ctx.version.id))!;
}

/** The Word document for this version's SOP. */
export async function buildSop(db: Db, user: CurrentUser, ctx: VersionContext) {
  const sop = await toSop(db, ctx.version.id);
  if (!sop) throw new GovernanceError(404, 'Generate the SOP first');
  const [graph, process] = await Promise.all([
    getVersionGraph(db, user, ctx.version.id),
    getProcess(db, user, ctx.process.id),
  ]);
  const { scene, svg } = await renderProcessSvg(
    graph!,
    `${process!.name} — v${graph!.versionNumber}`,
  );
  let docs = (await documentsForProcess(db, ctx.process.id)) ?? [];
  if (!docs.length) {
    const kb = await departmentKnowledgeBase(db, ctx.process.departmentId);
    if (kb) docs = await listDocuments(db, { knowledgeBaseId: kb.id, activeOnly: true });
  }
  const provenance: Record<string, number> = {};
  for (const x of [...graph!.steps, ...graph!.edges, ...graph!.rules])
    provenance[x.provenance] = (provenance[x.provenance] ?? 0) + 1;

  const body = await buildSopDocx({
    docId: sop.docId,
    docVersion: sop.docVersion,
    status: sop.status,
    classification: sop.classification,
    reviewCycleMonths: sop.reviewCycleMonths,
    process: process!,
    graph: graph!,
    controls: await listControls(db, ctx.version.id),
    wording: sop.wording,
    aiDrafted: sop.aiDrafted,
    diagram: { svg, width: scene.width, height: scene.height },
    references: docs
      .filter((d) => REFERENCE_CATEGORIES.has(d.category) && d.id !== sop.knowledgeDocumentId)
      .slice(0, 12)
      .map((d) => ({ title: d.title, category: d.category, docVersion: d.docVersion })),
    contributors: (await listContributors(db, ctx.version.id)).map((c) => ({
      displayName: c.user.displayName,
      department: c.user.department,
    })),
    provenance,
    generatedAt: new Date(),
  });
  const filename = `${sop.docId}-v${sop.docVersion}-${process!.slug}.docx`;
  return { sop, body, filename };
}

/**
 * Publishes the SOP of an approved version into the department's knowledge base (category SOP,
 * linked to the process) and indexes it, so interviews and comparisons use it. The previous
 * published SOP of this process is marked inactive.
 */
export async function publishSop(
  db: Db,
  user: CurrentUser,
  ctx: VersionContext,
  store: FileStore,
  jobs: JobQueue,
) {
  if (!canManage(ctx))
    throw new GovernanceError(403, 'Only the process owner or an admin can publish the SOP');
  const state = await sopState(db, ctx);
  if (!state.canPublish)
    throw new GovernanceError(409, state.publishBlockedReason ?? 'Cannot publish');
  const kb = await departmentKnowledgeBase(db, ctx.process.departmentId);
  if (!kb)
    throw new GovernanceError(
      409,
      'Create a knowledge base for this department in Admin first, then publish.',
    );

  // Mark published before building so the document itself carries the approved status.
  const row = (await sopRow(db, ctx.version.id))!;
  await db
    .update(sopDocuments)
    .set({ status: 'published', publishedBy: user.id, publishedAt: new Date() })
    .where(eq(sopDocuments.id, row.sop.id));
  try {
    const { sop, body, filename } = await buildSop(db, user, ctx);
    const storageKey = `documents/${randomUUID()}.docx`;
    await store.put(storageKey, body);
    const [doc] = await db.transaction(async (tx) => {
      await tx
        .update(documents)
        .set({ isActive: false })
        .where(
          and(
            eq(documents.processId, ctx.process.id),
            eq(documents.category, 'sop'),
            sql`${documents.title} like ${`${sop.docId} %`}`,
          ),
        );
      return tx
        .insert(documents)
        .values({
          knowledgeBaseId: kb.id,
          title: `${sop.docId} ${ctx.process.name}`,
          filename,
          mimeType: DOCX_MIME,
          sizeBytes: body.length,
          sha256: createHash('sha256').update(body).digest('hex'),
          storageKey,
          category: 'sop',
          categorySource: 'user',
          docVersion: sop.docVersion,
          effectiveDate: ctx.version.approvedAt?.toISOString().slice(0, 10) ?? null,
          processId: ctx.process.id,
          uploadedBy: user.id,
        })
        .returning();
    });
    await db
      .update(sopDocuments)
      .set({ knowledgeDocumentId: doc!.id })
      .where(eq(sopDocuments.id, row.sop.id));
    await jobs.enqueueIngest(doc!.id);
    return (await toSop(db, ctx.version.id))!;
  } catch (e) {
    await db
      .update(sopDocuments)
      .set({ status: 'draft', publishedBy: null, publishedAt: null })
      .where(eq(sopDocuments.id, row.sop.id));
    throw e;
  }
}
