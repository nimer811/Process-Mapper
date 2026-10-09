import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockGateway } from '@process-ai/agent';
import type {
  Coverage,
  EndToEndFlow,
  ProcessCategory,
  ProcessDetail,
  ProcessLink,
  ProcessListItem,
} from '@process-ai/shared';
import { ADMIN, EMPLOYEE, OWNER, startTestApp } from './helpers.js';

describe('Process architecture', () => {
  const llm = new MockGateway();
  let t: Awaited<ReturnType<typeof startTestApp>>;
  let vendor: ProcessListItem;
  let pr: ProcessListItem;
  let categories: ProcessCategory[];
  const req = (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    email: string,
    payload?: object,
  ) => t.app.inject({ method, url: `/api/v1${url}`, headers: t.as(email), payload });
  const code = (c: string) => categories.find((x) => x.code === c)!;

  beforeAll(async () => {
    t = await startTestApp({ llm });
    const list = (await req('GET', '/processes', OWNER)).json<ProcessListItem[]>();
    vendor = list.find((p) => p.slug === 'vendor-onboarding')!;
    pr = list.find((p) => p.slug === 'purchase-requisition-to-po')!;
    categories = (await req('GET', '/categories', EMPLOYEE)).json<ProcessCategory[]>();
  });
  afterAll(async () => {
    await t?.stop();
  });

  it('seeds an APQC-based classification that admins can extend', async () => {
    expect(categories.map((c) => c.code)).toEqual([
      '4.0',
      '4.2',
      '4.2.1',
      '4.2.2',
      '4.2.3',
      '4.2.4',
      '9.0',
      '9.6',
      '9.6.1',
      '9.6.2',
    ]);
    expect(code('4.2.2')).toMatchObject({ level: 3, parentId: code('4.2').id });
    expect(code('4.2').departmentId).not.toBeNull();

    const body = { code: '4.2.2.1', name: 'Onboard suppliers', parentId: code('4.2.2').id };
    expect((await req('POST', '/categories', OWNER, body)).statusCode).toBe(403);
    const created = await req('POST', '/categories', ADMIN, body);
    expect(created.statusCode).toBe(201);
    expect(created.json<ProcessCategory>().level).toBe(4);
    expect((await req('POST', '/categories', ADMIN, body)).statusCode).toBe(409);
    expect(
      (
        await req('POST', '/categories', ADMIN, {
          code: 'x',
          name: 'Too deep',
          parentId: created.json<ProcessCategory>().id,
        })
      ).statusCode,
    ).toBe(400);
  });

  it('places a process on the tree, with an AI suggestion the owner can apply', async () => {
    llm.enqueue('classify', { code: '4.2.2.1', reasoning: 'It brings new suppliers on board.' });
    const s = await req('POST', `/processes/${vendor.id}/category/suggest`, OWNER);
    expect(s.statusCode).toBe(200);
    expect(s.json()).toMatchObject({
      category: { code: '4.2.2.1' },
      reasoning: 'It brings new suppliers on board.',
    });
    llm.enqueue('classify', { code: '99.9', reasoning: 'Made up' });
    expect(
      (await req('POST', `/processes/${vendor.id}/category/suggest`, OWNER)).json<{
        category: null;
      }>().category,
    ).toBeNull();

    expect(
      (
        await req('PUT', `/processes/${vendor.id}/category`, EMPLOYEE, {
          categoryId: code('4.2.2').id,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await req('PUT', `/processes/${vendor.id}/category`, OWNER, {
          categoryId: code('4.2.2').id,
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await req('PUT', `/processes/${pr.id}/category`, OWNER, { categoryId: code('4.2.3').id }))
        .statusCode,
    ).toBe(204);
    const detail = (await req('GET', `/processes/${vendor.id}`, EMPLOYEE)).json<ProcessDetail>();
    expect(detail.category).toMatchObject({ code: '4.2.2' });
  });

  it('links processes, suggests hand-offs, and shows the end-to-end chain', async () => {
    const res = await req('POST', `/processes/${vendor.id}/links`, OWNER, {
      toProcessId: pr.id,
      fromStepKey: 'S15',
      label: 'Active supplier',
    });
    expect(res.statusCode).toBe(201);
    expect(
      (await req('POST', `/processes/${vendor.id}/links`, OWNER, { toProcessId: vendor.id }))
        .statusCode,
    ).toBe(400);

    // The AI proposes the reverse (made-up process labels are ignored); it stays inferred.
    llm.enqueue('classify', {
      links: [
        {
          from: 'P1',
          to: 'THIS',
          from_step: null,
          label: 'New supplier request',
          reasoning: 'A requisition for an unknown supplier starts onboarding.',
          confidence: 0.8,
        },
        {
          from: 'THIS',
          to: 'P9',
          from_step: null,
          label: 'x',
          reasoning: 'x',
          confidence: 0.9,
        },
      ],
    });
    const suggested = await req('POST', `/processes/${vendor.id}/links/suggest`, OWNER);
    expect(suggested.statusCode).toBe(201);
    const [inferred] = suggested.json<ProcessLink[]>();
    expect(inferred).toMatchObject({ provenance: 'inferred', label: 'New supplier request' });

    const links = (await req('GET', `/processes/${vendor.id}/links`, OWNER)).json<ProcessLink[]>();
    expect(links.map((l) => [l.from.name, l.to.name, l.provenance])).toContainEqual([
      'Vendor Onboarding',
      'Purchase Requisition to PO',
      'confirmed',
    ]);
    expect((await req('POST', `/process-links/${inferred!.id}/confirm`, EMPLOYEE)).statusCode).toBe(
      403,
    );
    expect((await req('POST', `/process-links/${inferred!.id}/confirm`, OWNER)).statusCode).toBe(
      204,
    );

    const flow = (await req('GET', `/processes/${pr.id}/flow`, OWNER)).json<EndToEndFlow>();
    expect(flow.processes.map((p) => p.name).sort()).toEqual([
      'Purchase Requisition to PO',
      'Vendor Onboarding',
    ]);
    expect(flow.links).toHaveLength(2);
    expect(flow.processes.find((p) => p.name === 'Vendor Onboarding')!.category).toMatchObject({
      code: '4.2.2',
    });
  });

  it("reports a department's coverage against its part of the tree", async () => {
    const c = (await req('GET', '/departments/procurement/coverage', OWNER)).json<Coverage>();
    expect(c.areas.map((a) => a.group.code)).toEqual(['4.2']);
    expect(c.areas[0]!.items.map((i) => i.category.code)).toEqual([
      '4.2.1',
      '4.2.2.1',
      '4.2.3',
      '4.2.4',
    ]);
    // Vendor Onboarding sits on 4.2.2 itself (a group of the new 4.2.2.1 leaf): placed, not unclassified.
    expect(c.unclassified.map((p) => p.name)).not.toContain('Vendor Onboarding');
    expect(c.totals).toMatchObject({ expected: 4, mapped: 1 });
    expect(
      c.areas[0]!.items.find((i) => i.category.code === '4.2.3')!.processes.map((p) => p.name),
    ).toEqual(['Purchase Requisition to PO']);
  });
});
