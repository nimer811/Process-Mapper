import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, asc, count, departments, eq, isNull, processes, type Db } from '@process-ai/db';
import { Department, DepartmentInput } from '@process-ai/shared';
import { audit } from '../../lib/audit.js';

const IdParams = z.object({ id: z.uuid() });

function isUniqueViolation(e: unknown) {
  const code =
    (e as { code?: string; cause?: { code?: string } }).code ??
    (e as { cause?: { code?: string } }).cause?.code;
  return code === '23505';
}

export const departmentRoutes: FastifyPluginAsyncZod<{ db: Db }> = async (app, { db }) => {
  async function load(id?: string) {
    const rows = await db
      .select({
        id: departments.id,
        name: departments.name,
        slug: departments.slug,
        description: departments.description,
        isActive: departments.isActive,
        processCount: count(processes.id),
      })
      .from(departments)
      .leftJoin(
        processes,
        and(eq(processes.departmentId, departments.id), isNull(processes.archivedAt)),
      )
      .where(id ? eq(departments.id, id) : undefined)
      .groupBy(departments.id)
      .orderBy(asc(departments.name));
    return rows;
  }

  app.get(
    '/departments',
    { schema: { response: { 200: z.array(Department) } } },
    async (request) => {
      const user = app.requireUser(request);
      const rows = await load();
      return user.roles.includes('admin') ? rows : rows.filter((d) => d.isActive);
    },
  );

  app.post(
    '/departments',
    { schema: { body: DepartmentInput, response: { 201: Department } } },
    async (request, reply) => {
      app.requireRole(request, 'admin');
      try {
        const created = await db.transaction(async (tx) => {
          const [row] = await tx.insert(departments).values(request.body).returning();
          await audit(tx as unknown as Db, request, {
            action: 'department.created',
            entityType: 'department',
            entityId: row!.id,
            after: row,
          });
          return row!;
        });
        const [dept] = await load(created.id);
        return reply.status(201).send(dept!);
      } catch (e) {
        if (isUniqueViolation(e))
          throw app.httpErrors.conflict('A department with this slug already exists');
        throw e;
      }
    },
  );

  app.patch(
    '/departments/:id',
    {
      schema: { params: IdParams, body: DepartmentInput.partial(), response: { 200: Department } },
    },
    async (request) => {
      app.requireRole(request, 'admin');
      const before = await db.query.departments.findFirst({
        where: eq(departments.id, request.params.id),
      });
      if (!before) throw app.httpErrors.notFound('Department not found');
      try {
        await db.transaction(async (tx) => {
          const [after] = await tx
            .update(departments)
            .set(request.body)
            .where(eq(departments.id, before.id))
            .returning();
          await audit(tx as unknown as Db, request, {
            action: 'department.updated',
            entityType: 'department',
            entityId: before.id,
            before,
            after,
          });
        });
      } catch (e) {
        if (isUniqueViolation(e))
          throw app.httpErrors.conflict('A department with this slug already exists');
        throw e;
      }
      const [dept] = await load(before.id);
      return dept!;
    },
  );
};
