import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { ProcessListItem } from '@process-ai/shared';
import { EMPLOYEE, OWNER, startTestApp } from './helpers.js';

describe('process packs', () => {
  let t: Awaited<ReturnType<typeof startTestApp>>;
  let vendor: ProcessListItem;
  let draft: ProcessListItem;

  beforeAll(async () => {
    t = await startTestApp();
    const all = (
      await t.app.inject({ method: 'GET', url: '/api/v1/processes', headers: t.as(OWNER) })
    ).json<ProcessListItem[]>();
    vendor = all.find((p) => p.slug === 'vendor-onboarding')!;
    draft = all.find((p) => p.status === 'draft')!;
  });
  afterAll(async () => {
    await t?.stop();
  });

  it('exports a process pack PDF', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/v1/versions/${vendor.versionId}/pack.pdf`,
      headers: t.as(EMPLOYEE),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('vendor-onboarding-v1-process-pack.pdf');
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(res.rawPayload.length).toBeGreaterThan(10_000);
  });

  it('exports the map as standalone SVG', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/v1/versions/${vendor.versionId}/map.svg`,
      headers: t.as(EMPLOYEE),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/svg+xml');
    expect(res.body).toContain('Verify bank details');
    expect(res.body).toContain('Sanctions hit');
  });

  it("doesn't export drafts the user can't see", async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/v1/versions/${draft.versionId}/pack.pdf`,
      headers: t.as(EMPLOYEE),
    });
    expect(res.statusCode).toBe(404);
  });

  it('exports a department ZIP with only the processes the user can see', async () => {
    const zipFor = async (email: string) => {
      const res = await t.app.inject({
        method: 'GET',
        url: '/api/v1/departments/procurement/pack.zip',
        headers: t.as(email),
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/zip');
      return unzipSync(new Uint8Array(res.rawPayload));
    };

    const employeeZip = await zipFor(EMPLOYEE);
    expect(Object.keys(employeeZip).sort()).toEqual([
      'index.csv',
      'vendor-onboarding/vendor-onboarding-v1-map.svg',
      'vendor-onboarding/vendor-onboarding-v1-process-pack.pdf',
    ]);
    expect(strFromU8(employeeZip['index.csv']!)).toContain('Vendor Onboarding,approved,v1');

    const ownerZip = await zipFor(OWNER);
    expect(Object.keys(ownerZip)).toContain(
      'purchase-requisition-to-po/purchase-requisition-to-po-v1-process-pack.pdf',
    );
  });

  it('returns 404 for a department with nothing to export', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/v1/departments/finance/pack.zip',
      headers: t.as(EMPLOYEE),
    });
    expect(res.statusCode).toBe(404);
  });
});
