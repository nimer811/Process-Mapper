import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockGateway } from '@process-ai/agent';
import { approvalMatrixXlsx, policyDocx } from '@process-ai/knowledge/test-fixtures';
import { and, businessRules, eq, evidence } from '@process-ai/db';
import type {
  Department,
  InterviewDetail,
  KnowledgeBase,
  KnowledgeDocument,
  KnowledgeSearchResult,
  ProcessListItem,
} from '@process-ai/shared';
import { ADMIN, EMPLOYEE, startTestApp } from './helpers.js';

/** Builds a multipart/form-data body for app.inject. */
function multipart(file: { name: string; data: Buffer }, fields: Record<string, string>) {
  const boundary = '----processai' + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    file.data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return {
    payload: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('knowledge base', () => {
  const llm = new MockGateway({ respond: () => 'Noted.' });
  let t: Awaited<ReturnType<typeof startTestApp>>;
  let kb: KnowledgeBase;
  let policy: KnowledgeDocument;
  let procurement: Department;
  let policyBytes: Buffer;

  beforeAll(async () => {
    t = await startTestApp({ llm });
    procurement = (
      await t.app.inject({ method: 'GET', url: '/api/v1/departments', headers: t.as(ADMIN) })
    )
      .json<Department[]>()
      .find((d) => d.slug === 'procurement')!;
    policyBytes = await policyDocx();
  });
  afterAll(async () => {
    await t?.stop();
  });

  const upload = (name: string, data: Buffer, fields: Record<string, string>, email = ADMIN) => {
    const body = multipart({ name, data }, fields);
    return t.app.inject({
      method: 'POST',
      url: `/api/v1/knowledge-bases/${kb.id}/documents`,
      headers: { ...t.as(email), ...body.headers },
      payload: body.payload,
    });
  };
  const search = async (query: string) =>
    (
      await t.app.inject({
        method: 'POST',
        url: '/api/v1/knowledge/search',
        headers: t.as(ADMIN),
        payload: { query },
      })
    ).json<KnowledgeSearchResult[]>();

  it('lets admins create a knowledge base for a department', async () => {
    const denied = await t.app.inject({
      method: 'POST',
      url: '/api/v1/knowledge-bases',
      headers: t.as(EMPLOYEE),
      payload: { name: 'Finance KB' },
    });
    expect(denied.statusCode).toBe(403);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/knowledge-bases',
      headers: t.as(ADMIN),
      payload: {
        name: 'Procurement',
        description: 'Procurement SOPs',
        departmentId: procurement.id,
      },
    });
    expect(res.statusCode).toBe(201);
    kb = res.json<KnowledgeBase>();
    expect(kb).toMatchObject({
      slug: 'procurement',
      department: { name: 'Procurement' },
      documentCount: 0,
    });
  });

  it('uploads, checks and indexes documents', async () => {
    expect(
      (await upload('policy.docx', policyBytes, { category: 'policy' }, EMPLOYEE)).statusCode,
    ).toBe(403);

    const res = await upload('Procurement Policy.docx', policyBytes, {
      category: 'policy',
      docVersion: '3.1',
    });
    expect(res.statusCode).toBe(201);
    policy = res.json<KnowledgeDocument>();
    expect(policy).toMatchObject({
      title: 'Procurement Policy',
      category: 'policy',
      docVersion: '3.1',
    });

    const docs = (
      await t.app.inject({
        method: 'GET',
        url: `/api/v1/knowledge-bases/${kb.id}/documents`,
        headers: t.as(ADMIN),
      })
    ).json<KnowledgeDocument[]>();
    expect(docs[0]).toMatchObject({ status: 'ready' });
    expect(docs[0]!.chunkCount).toBeGreaterThan(1);

    const matrix = await upload('DoA matrix.xlsx', approvalMatrixXlsx(), {
      category: 'approval_matrix',
      title: 'DoA Matrix',
    });
    expect(matrix.statusCode).toBe(201);
  });

  it('rejects duplicates and disguised files', async () => {
    expect((await upload('again.docx', policyBytes, { category: 'policy' })).statusCode).toBe(409);
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(500)]);
    const bad = await upload('invoice.pdf', exe, { category: 'form' });
    expect(bad.statusCode).toBe(415);
    expect(
      (await upload('x.docx', policyBytes.subarray(0, 10), { category: 'nonsense' })).statusCode,
    ).toBe(400);
  });

  it('finds the right passage with hybrid search, with a citation', async () => {
    const results = await search('finance approval above AED 100,000');
    expect(results[0]).toMatchObject({
      documentTitle: 'Procurement Policy',
      citation: 'Procurement Policy, 4.2 Finance review',
    });
    const matrix = await search('who approves goods up to 500000 CFO');
    expect(matrix.some((r) => r.citation === 'DoA Matrix, sheet Goods')).toBe(true);
  });

  it('serves downloads, and hides deactivated documents from search and users', async () => {
    const dl = await t.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${policy.id}/download`,
      headers: t.as(EMPLOYEE),
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.equals(policyBytes)).toBe(true);

    await t.app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${policy.id}`,
      headers: t.as(ADMIN),
      payload: { isActive: false },
    });
    expect(
      (await search('finance approval above AED 100,000')).some((r) => r.documentId === policy.id),
    ).toBe(false);
    expect(
      (
        await t.app.inject({
          method: 'GET',
          url: `/api/v1/documents/${policy.id}/download`,
          headers: t.as(EMPLOYEE),
        })
      ).statusCode,
    ).toBe(404);
    await t.app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${policy.id}`,
      headers: t.as(ADMIN),
      payload: { isActive: true },
    });
  });

  it("lists the department's documents on its processes", async () => {
    const [vendor] = (
      await t.app.inject({ method: 'GET', url: '/api/v1/processes', headers: t.as(EMPLOYEE) })
    ).json<ProcessListItem[]>();
    const docs = (
      await t.app.inject({
        method: 'GET',
        url: `/api/v1/processes/${vendor!.id}/documents`,
        headers: t.as(EMPLOYEE),
      })
    ).json<KnowledgeDocument[]>();
    expect(docs.map((d) => d.title).sort()).toEqual(['DoA Matrix', 'Procurement Policy']);
  });

  it('grounds the interview: cites the SOP for contradictions and records documented rules', async () => {
    const started = await t.app.inject({
      method: 'POST',
      url: '/api/v1/interviews',
      headers: t.as(EMPLOYEE),
      payload: { departmentId: procurement.id, processName: 'Purchase Requisition' },
    });
    const interview = started.json<{ interview: InterviewDetail }>().interview;

    // Retrieved passages reach the extractor labelled D1..D5; cite whichever holds the finance rule.
    llm.enqueue('extract', ({ prompt }: { prompt: string }) => {
      const finance =
        /\[(D\d)\] Procurement Policy, 4\.2 Finance review/.exec(prompt)?.[1] ?? 'missing';
      return {
        user_intent: 'continue',
        ops: [
          {
            op: 'raise_item',
            type: 'contradiction',
            step: null,
            source: finance,
            priority: 'high',
            description:
              'The policy says Finance approves only above AED 100,000, but the employee said Finance reviews every request. Which is current?',
          },
          {
            op: 'add_rule',
            step: null,
            rule_type: 'threshold',
            provenance: 'documented',
            source: finance,
            quote: null,
            statement: 'Finance approval is required for purchase requisitions above AED 100,000.',
          },
          {
            op: 'raise_item',
            type: 'contradiction',
            step: null,
            source: 'D9',
            priority: 'high',
            description: 'Fabricated citation',
          },
        ],
      };
    });
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/v1/interviews/${interview.id}/messages`,
      headers: t.as(EMPLOYEE),
      payload: { text: 'Finance reviews every purchase request, whatever the amount.' },
    });
    expect(res.statusCode).toBe(200);
    // The finance passage was retrieved and shown to the extractor with a D label.
    expect(llm.calls.filter((c) => c.purpose === 'extract').at(-1)!.prompt).toMatch(
      /\[D\d\] Procurement Policy, 4\.2 Finance review/,
    );

    const detail = (
      await t.app.inject({
        method: 'GET',
        url: `/api/v1/interviews/${interview.id}`,
        headers: t.as(EMPLOYEE),
      })
    ).json<InterviewDetail>();
    const contradictions = detail.openItems.filter((i) => i.type === 'contradiction');
    expect(contradictions).toHaveLength(1); // the fabricated D9 citation was rejected
    const reply = detail.messages.at(-1)!;
    expect(reply.citations).toEqual([
      { documentId: policy.id, label: 'Procurement Policy, 4.2 Finance review' },
    ]);

    const rules = await t.db
      .select()
      .from(businessRules)
      .where(eq(businessRules.versionId, interview.versionId));
    expect(rules).toEqual([
      expect.objectContaining({ provenance: 'documented', ruleType: 'threshold' }),
    ]);
    const [ev] = await t.db
      .select()
      .from(evidence)
      .where(and(eq(evidence.entityType, 'rule'), eq(evidence.entityId, rules[0]!.id)));
    expect(ev).toMatchObject({ sourceType: 'document' });
    expect(ev!.chunkId).not.toBeNull();
  });
});
