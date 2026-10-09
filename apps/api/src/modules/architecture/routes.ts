import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { eq, processCategories, processes, processLinks, type Db } from '@process-ai/db';
import {
  CategorySuggestion,
  Coverage,
  EndToEndFlow,
  ProcessCategory,
  ProcessCategoryInput,
  ProcessLink,
  ProcessLinkInput,
} from '@process-ai/shared';
import { suggestCategory, suggestLinks, type LlmGateway } from '@process-ai/agent';
import { audit } from '../../lib/audit.js';
import { getProcess, getVersionGraph, listProcesses } from '../processes/service.js';
import {
  categoryPath,
  coverage,
  endToEnd,
  linksFor,
  listCategories,
  toCategory,
} from './service.js';

const IdParams = z.object({ id: z.uuid() });
const SlugParams = z.object({ slug: z.string() });

/** Process architecture: classification levels, hand-offs between processes, coverage. */
export const architectureRoutes: FastifyPluginAsyncZod<{ db: Db; llm: LlmGateway | null }> = async (
  app,
  { db, llm },
) => {
  const requireLlm = () => {
    if (!llm) throw app.httpErrors.serviceUnavailable('The AI is not configured. Set LLM_API_KEY.');
    return llm;
  };
  /** A process the user can see, and whether they may manage it (owner or admin). */
  const processFor = async (request: FastifyRequest, id: string, manage: boolean) => {
    const user = app.requireUser(request);
    const p = await getProcess(db, user, id);
    if (!p) throw app.httpErrors.notFound('Process not found');
    const canManage = user.roles.includes('admin') || p.owner?.id === user.id;
    if (manage && !canManage)
      throw app.httpErrors.forbidden('Only the process owner or an admin can change this');
    if (manage && p.archivedAt) throw app.httpErrors.conflict('This process is archived');
    return { user, p };
  };

  // ---- Classification ----

  app.get(
    '/categories',
    { schema: { response: { 200: z.array(ProcessCategory) } } },
    async (request) => {
      app.requireUser(request);
      return listCategories(db);
    },
  );

  app.post(
    '/categories',
    { schema: { body: ProcessCategoryInput, response: { 201: ProcessCategory } } },
    async (request, reply) => {
      app.requireRole(request, 'admin');
      const parent = request.body.parentId
        ? await db.query.processCategories.findFirst({
            where: eq(processCategories.id, request.body.parentId),
          })
        : null;
      if (request.body.parentId && !parent) throw app.httpErrors.badRequest('Unknown parent');
      if (parent && parent.level >= 4)
        throw app.httpErrors.badRequest('The classification has at most 4 levels');
      try {
        const [row] = await db
          .insert(processCategories)
          .values({ ...request.body, level: parent ? parent.level + 1 : 1 })
          .returning();
        await audit(db, request, {
          action: 'category.added',
          entityType: 'process_category',
          entityId: row!.id,
          after: request.body,
        });
        return reply.status(201).send(toCategory(row!));
      } catch (e) {
        if (
          (e as { code?: string }).code === '23505' ||
          (e as { cause?: { code?: string } }).cause?.code === '23505'
        )
          throw app.httpErrors.conflict('That code is already used');
        throw e;
      }
    },
  );

  app.patch(
    '/categories/:id',
    {
      schema: {
        params: IdParams,
        body: ProcessCategoryInput.omit({ parentId: true }).partial(),
        response: { 200: ProcessCategory },
      },
    },
    async (request) => {
      app.requireRole(request, 'admin');
      const [row] = await db
        .update(processCategories)
        .set(request.body)
        .where(eq(processCategories.id, request.params.id))
        .returning();
      if (!row) throw app.httpErrors.notFound('Not found');
      await audit(db, request, {
        action: 'category.updated',
        entityType: 'process_category',
        entityId: row.id,
        after: request.body,
      });
      return toCategory(row);
    },
  );

  /** Deleting a node removes its children; processes placed there become unclassified. */
  app.delete('/categories/:id', { schema: { params: IdParams } }, async (request, reply) => {
    app.requireRole(request, 'admin');
    const deleted = await db
      .delete(processCategories)
      .where(eq(processCategories.id, request.params.id))
      .returning();
    if (!deleted.length) throw app.httpErrors.notFound('Not found');
    await audit(db, request, {
      action: 'category.deleted',
      entityType: 'process_category',
      entityId: request.params.id,
    });
    return reply.status(204).send();
  });

  app.put(
    '/processes/:id/category',
    { schema: { params: IdParams, body: z.object({ categoryId: z.uuid().nullable() }) } },
    async (request, reply) => {
      const { p } = await processFor(request, request.params.id, true);
      if (request.body.categoryId) {
        const exists = await db.query.processCategories.findFirst({
          where: eq(processCategories.id, request.body.categoryId),
        });
        if (!exists) throw app.httpErrors.badRequest('Unknown category');
      }
      await db
        .update(processes)
        .set({ categoryId: request.body.categoryId })
        .where(eq(processes.id, p.id));
      await audit(db, request, {
        action: 'process.classified',
        entityType: 'process',
        entityId: p.id,
        after: request.body,
      });
      return reply.status(204).send();
    },
  );

  /** The AI's suggestion of where the process belongs (not applied; the owner chooses). */
  app.post(
    '/processes/:id/category/suggest',
    { schema: { params: IdParams, response: { 200: CategorySuggestion } } },
    async (request) => {
      const { user, p } = await processFor(request, request.params.id, true);
      const graph = (await getVersionGraph(db, user, p.defaultVersionId))!;
      const all = await listCategories(db);
      const pick = await suggestCategory(requireLlm(), {
        processName: p.name,
        graph,
        categories: all.map((c) => ({ code: c.code, name: c.name, path: categoryPath(all, c.id) })),
      });
      const chosen = all.find((c) => c.code === pick.code);
      return {
        category: chosen ? { id: chosen.id, code: chosen.code, name: chosen.name } : null,
        reasoning: pick.reasoning,
      };
    },
  );

  // ---- Hand-offs between processes ----

  app.get(
    '/processes/:id/links',
    { schema: { params: IdParams, response: { 200: z.array(ProcessLink) } } },
    async (request) => {
      const { user, p } = await processFor(request, request.params.id, false);
      const visible = new Set((await listProcesses(db, user, {})).map((x) => x.id));
      return (await linksFor(db, [p.id])).filter(
        (l) => visible.has(l.from.id) && visible.has(l.to.id),
      );
    },
  );

  app.post(
    '/processes/:id/links',
    {
      schema: {
        params: IdParams,
        body: ProcessLinkInput,
        response: { 201: z.object({ id: z.uuid() }) },
      },
    },
    async (request, reply) => {
      const { user, p } = await processFor(request, request.params.id, true);
      if (request.body.toProcessId === p.id)
        throw app.httpErrors.badRequest('A process cannot hand off to itself');
      const target = await getProcess(db, user, request.body.toProcessId);
      if (!target) throw app.httpErrors.badRequest('Unknown process');
      const [row] = await db
        .insert(processLinks)
        .values({
          fromProcessId: p.id,
          toProcessId: target.id,
          fromStepKey: request.body.fromStepKey ?? null,
          label: request.body.label ?? null,
          provenance: 'confirmed',
          createdBy: user.id,
        })
        .onConflictDoUpdate({
          target: [processLinks.fromProcessId, processLinks.toProcessId],
          set: {
            fromStepKey: request.body.fromStepKey ?? null,
            label: request.body.label ?? null,
            provenance: 'confirmed',
          },
        })
        .returning({ id: processLinks.id });
      await audit(db, request, {
        action: 'process.linked',
        entityType: 'process_link',
        entityId: row!.id,
        after: request.body,
      });
      return reply.status(201).send(row!);
    },
  );

  const linkFor = async (request: FastifyRequest, id: string) => {
    const link = await db.query.processLinks.findFirst({ where: eq(processLinks.id, id) });
    if (!link) throw app.httpErrors.notFound('Link not found');
    // Either side's owner (or an admin) may confirm or remove it.
    const user = app.requireUser(request);
    const sides = await db.query.processes.findMany({
      where: (pr, { inArray: within }) => within(pr.id, [link.fromProcessId, link.toProcessId]),
    });
    if (!user.roles.includes('admin') && !sides.some((s) => s.ownerUserId === user.id))
      throw app.httpErrors.forbidden(
        'Only an owner of either process or an admin can change this link',
      );
    return link;
  };

  app.post(
    '/process-links/:id/confirm',
    { schema: { params: IdParams } },
    async (request, reply) => {
      const link = await linkFor(request, request.params.id);
      await db
        .update(processLinks)
        .set({ provenance: 'confirmed' })
        .where(eq(processLinks.id, link.id));
      return reply.status(204).send();
    },
  );

  app.delete('/process-links/:id', { schema: { params: IdParams } }, async (request, reply) => {
    const link = await linkFor(request, request.params.id);
    await db.delete(processLinks).where(eq(processLinks.id, link.id));
    await audit(db, request, {
      action: 'process.unlinked',
      entityType: 'process_link',
      entityId: link.id,
    });
    return reply.status(204).send();
  });

  /** The AI looks for hand-offs with the organisation's other processes; they stay inferred until confirmed. */
  app.post(
    '/processes/:id/links/suggest',
    { schema: { params: IdParams, response: { 201: z.array(ProcessLink) } } },
    async (request, reply) => {
      const { user, p } = await processFor(request, request.params.id, true);
      const graph = (await getVersionGraph(db, user, p.defaultVersionId))!;
      const candidates = (await listProcesses(db, user, {}))
        .filter((x) => x.id !== p.id)
        .slice(0, 25);
      const others = [];
      for (const [i, c] of candidates.entries()) {
        const g = await getVersionGraph(db, user, c.versionId);
        if (g)
          others.push({
            label: `P${i + 1}`,
            id: c.id,
            name: c.name,
            department: c.department.name,
            graph: g,
          });
      }
      const found = await suggestLinks(requireLlm(), { process: { name: p.name, graph }, others });
      const existing = await linksFor(db, [p.id]);
      const created: string[] = [];
      for (const s of found) {
        const other = others.find((o) => o.label === s.otherLabel)!;
        const [fromId, toId] = s.direction === 'outgoing' ? [p.id, other.id] : [other.id, p.id];
        if (existing.some((l) => l.from.id === fromId && l.to.id === toId)) continue;
        const [row] = await db
          .insert(processLinks)
          .values({
            fromProcessId: fromId,
            toProcessId: toId,
            fromStepKey: s.fromStepKey,
            label: s.label,
            reasoning: s.reasoning,
            provenance: 'inferred',
            createdBy: user.id,
          })
          .onConflictDoNothing()
          .returning({ id: processLinks.id });
        if (row) created.push(row.id);
      }
      const all = await linksFor(db, [p.id]);
      return reply.status(201).send(all.filter((l) => created.includes(l.id)));
    },
  );

  app.get(
    '/processes/:id/flow',
    { schema: { params: IdParams, response: { 200: EndToEndFlow } } },
    async (request) => {
      const { user, p } = await processFor(request, request.params.id, false);
      return endToEnd(db, user, p.id);
    },
  );

  app.get(
    '/departments/:slug/coverage',
    { schema: { params: SlugParams, response: { 200: Coverage } } },
    async (request) => coverage(db, app.requireUser(request), request.params.slug),
  );
};
