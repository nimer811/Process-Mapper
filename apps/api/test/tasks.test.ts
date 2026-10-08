import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { interviewSessions, processes, processVersions } from '@process-ai/db';
import { DEV_USER_HEADER, type Department, type Task } from '@process-ai/shared';
import { syncVersionTasks } from '../src/modules/tasks/service.js';
import { ADMIN, EMPLOYEE, OWNER, startTestApp } from './helpers.js';

describe('My actions inbox', () => {
  let t: Awaited<ReturnType<typeof startTestApp>>;
  let processId: string;
  let versionId: string;
  const idOf = (email: string) => t.as(email)[DEV_USER_HEADER]!;
  const inbox = async (email: string) =>
    (await t.app.inject({ method: 'GET', url: '/api/v1/tasks', headers: t.as(email) })).json<
      Task[]
    >();
  const open = async (email: string) =>
    (await inbox(email)).filter((x) => x.status === 'open' && x.link === `/processes/${processId}`);

  beforeAll(async () => {
    t = await startTestApp();
    const depts = (
      await t.app.inject({ method: 'GET', url: '/api/v1/departments', headers: t.as(ADMIN) })
    ).json<Department[]>();
    const [p] = await t.db
      .insert(processes)
      .values({
        departmentId: depts.find((d) => d.slug === 'procurement')!.id,
        name: 'Supplier Onboarding',
        slug: 'supplier-onboarding-inbox',
        createdBy: idOf(EMPLOYEE),
      })
      .returning();
    const [v] = await t.db
      .insert(processVersions)
      .values({
        processId: p!.id,
        versionNumber: 1,
        status: 'under_validation',
        ownerRole: 'Procurement Manager',
        createdBy: idOf(EMPLOYEE),
      })
      .returning();
    processId = p!.id;
    versionId = v!.id;
  });
  afterAll(async () => {
    await t?.stop();
  });

  it('asks admins to assign an owner, suggesting the role the interview named', async () => {
    await syncVersionTasks(t.db, versionId);
    await syncVersionTasks(t.db, versionId); // idempotent
    const tasks = await open(ADMIN);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ kind: 'assign_owner', dismissible: false });
    expect(tasks[0]!.detail).toContain('Procurement Manager');
  });

  it('moves the task to the owner once assigned, then to admins for approval', async () => {
    const assign = await t.app.inject({
      method: 'PATCH',
      url: `/api/v1/processes/${processId}`,
      headers: t.as(ADMIN),
      payload: { ownerUserId: idOf(OWNER) },
    });
    expect(assign.statusCode).toBe(204);
    expect(await open(ADMIN)).toEqual([]);
    expect((await open(OWNER)).map((x) => x.kind)).toEqual(['validate']);

    const validate = await t.app.inject({
      method: 'POST',
      url: `/api/v1/versions/${versionId}/transitions`,
      headers: t.as(OWNER),
      payload: { action: 'validate' },
    });
    expect(validate.statusCode).toBe(200);
    expect(await open(OWNER)).toEqual([]);
    expect((await inbox(OWNER)).find((x) => x.kind === 'validate')!.status).toBe('done');
    expect((await open(ADMIN)).map((x) => x.kind)).toEqual(['approve']);

    await t.app.inject({
      method: 'POST',
      url: `/api/v1/versions/${versionId}/transitions`,
      headers: t.as(ADMIN),
      payload: { action: 'approve' },
    });
    expect(await open(ADMIN)).toEqual([]);
  });

  it('nudges an interviewee whose interview went quiet; the nudge can be dismissed', async () => {
    await t.db.insert(interviewSessions).values({
      userId: idOf(EMPLOYEE),
      processId,
      versionId,
      status: 'paused',
      lastActivityAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    });
    const nudge = (await inbox(EMPLOYEE)).find((x) => x.kind === 'continue_interview')!;
    expect(nudge).toMatchObject({ status: 'open', dismissible: true });
    expect(nudge.title).toContain('Supplier Onboarding');
    expect(nudge.link).toMatch(/^\/interviews\//);

    const approveTask = (await inbox(ADMIN)).find((x) => x.kind === 'approve')!;
    const notMine = await t.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${approveTask.id}/dismiss`,
      headers: t.as(EMPLOYEE),
    });
    expect(notMine.statusCode).toBe(404);
    const lifecycle = await t.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${approveTask.id}/dismiss`,
      headers: t.as(ADMIN),
    });
    expect(lifecycle.statusCode).toBe(409);

    const dismiss = await t.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${nudge.id}/dismiss`,
      headers: t.as(EMPLOYEE),
    });
    expect(dismiss.statusCode).toBe(204);
    expect((await inbox(EMPLOYEE)).find((x) => x.id === nudge.id)!.status).toBe('dismissed');
  });
});
