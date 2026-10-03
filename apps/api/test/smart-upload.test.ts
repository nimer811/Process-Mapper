import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockGateway } from '@process-ai/agent';
import { approvalMatrixXlsx, policyDocx } from '@process-ai/knowledge/test-fixtures';
import type {
  BulkUploadResult,
  Department,
  KnowledgeBase,
  KnowledgeDocument,
  KnowledgeSearchResult,
} from '@process-ai/shared';
import { ADMIN, startTestApp } from './helpers.js';

function multipart(files: { name: string; data: Buffer }[], fields: Record<string, string> = {}) {
  const boundary = '----processai' + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields))
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`),
    );
  for (const f of files) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${f.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      f.data,
      Buffer.from('\r\n'),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

/** Mock classifier: reads the knowledge-base list from the prompt and files by file name. */
const label = (prompt: string, kbName: string) =>
  new RegExp(`(K\\d+): ${kbName}`).exec(prompt)?.[1] ?? null;
const llm = new MockGateway({
  classify: ({ prompt }) => {
    const file = /FILE NAME: (.*)/.exec(prompt)?.[1] ?? '';
    if (/policy/i.test(file)) {
      return {
        knowledge_base: label(prompt, 'Procurement'),
        category: 'policy',
        title: 'Procurement Policy',
        doc_version: '3.1',
        effective_date: '2026-01-01',
        confidence: 0.92,
        reason: 'Procurement approval rules.',
      };
    }
    if (/matrix/i.test(file)) {
      return {
        knowledge_base: label(prompt, 'Procurement'),
        category: 'approval_matrix',
        title: 'DoA Approval Matrix',
        doc_version: null,
        effective_date: null,
        confidence: 0.85,
        reason: 'Approver table by amount.',
      };
    }
    if (/guide/i.test(file)) {
      return {
        knowledge_base: label(prompt, 'Finance'),
        category: 'sop',
        title: null,
        doc_version: null,
        effective_date: null,
        confidence: 0.81,
        reason: 'Finance procedure.',
      };
    }
    return {
      knowledge_base: null,
      category: 'other',
      title: null,
      doc_version: null,
      effective_date: null,
      confidence: 0.3,
      reason: 'Unclear subject.',
    };
  },
});

describe('smart bulk upload', () => {
  let t: Awaited<ReturnType<typeof startTestApp>>;
  let procurementKb: KnowledgeBase;
  let financeKb: KnowledgeBase;
  const req = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
    t.app.inject({ method, url: `/api/v1${url}`, headers: t.as(ADMIN), payload });
  const bulk = (files: { name: string; data: Buffer }[]) => {
    const body = multipart(files);
    return t.app.inject({
      method: 'POST',
      url: '/api/v1/documents/bulk',
      headers: { ...t.as(ADMIN), ...body.headers },
      payload: body.payload,
    });
  };
  const doc = async (id: string) =>
    (await req('GET', '/documents/inbox')).json<KnowledgeDocument[]>().find((d) => d.id === id);

  beforeAll(async () => {
    t = await startTestApp({ llm });
    const depts = (await req('GET', '/departments')).json<Department[]>();
    const finance = (
      await req('POST', '/departments', { name: 'Finance', slug: 'finance' })
    ).json<Department>();
    procurementKb = (
      await req('POST', '/knowledge-bases', {
        name: 'Procurement',
        departmentId: depts.find((d) => d.slug === 'procurement')!.id,
      })
    ).json<KnowledgeBase>();
    financeKb = (
      await req('POST', '/knowledge-bases', { name: 'Finance', departmentId: finance.id })
    ).json<KnowledgeBase>();
  });
  afterAll(async () => {
    await t?.stop();
  });

  let result: BulkUploadResult;

  it('files each document into the right knowledge base and category, and rejects duplicates', async () => {
    const policy = await policyDocx();
    const res = await bulk([
      { name: 'policy_final_v3.docx', data: policy },
      { name: 'DoA matrix.xlsx', data: approvalMatrixXlsx() },
      {
        name: 'AP guide.txt',
        data: Buffer.from(
          '# Accounts payable\n\nInvoices are matched to POs before payment is released by Treasury.',
        ),
      },
      {
        name: 'misc notes.txt',
        data: Buffer.from('Some notes from a meeting about various topics and next steps.'),
      },
      { name: 'copy of policy.docx', data: policy },
    ]);
    expect(res.statusCode).toBe(201);
    result = res.json<BulkUploadResult>();
    expect(result.created).toHaveLength(4);
    expect(result.rejected).toEqual([
      { filename: 'copy of policy.docx', reason: expect.stringMatching(/Already uploaded/) },
    ]);

    const docs = (await req('GET', `/knowledge-bases/${procurementKb.id}/documents`)).json<
      KnowledgeDocument[]
    >();
    const p = docs.find((d) => d.filename === 'policy_final_v3.docx')!;
    expect(p).toMatchObject({
      title: 'Procurement Policy',
      category: 'policy',
      categorySource: 'ai',
      docVersion: '3.1',
      effectiveDate: '2026-01-01',
      needsReview: false,
      status: 'ready',
      knowledgeBaseName: 'Procurement',
    });
    expect(docs.find((d) => d.filename === 'DoA matrix.xlsx')).toMatchObject({
      category: 'approval_matrix',
      title: 'DoA Approval Matrix',
    });
    const fin = (await req('GET', `/knowledge-bases/${financeKb.id}/documents`)).json<
      KnowledgeDocument[]
    >();
    expect(fin.map((d) => [d.title, d.category])).toEqual([['AP guide', 'sop']]); // AI gave no title: file name kept
  });

  it('sends uncertain documents to the inbox, and an admin settles them', async () => {
    const inbox = (await req('GET', '/documents/inbox')).json<KnowledgeDocument[]>();
    expect(inbox.map((d) => d.filename)).toEqual(['misc notes.txt']);
    const notes = inbox[0]!;
    expect(notes).toMatchObject({
      knowledgeBaseId: null,
      needsReview: true,
      classificationReason: 'Unclear subject.',
    });

    // Can't confirm without a knowledge base.
    expect((await req('PATCH', `/documents/${notes.id}`, { reviewed: true })).statusCode).toBe(400);
    const res = await req('PATCH', `/documents/${notes.id}`, {
      knowledgeBaseId: procurementKb.id,
      category: 'other',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<KnowledgeDocument>()).toMatchObject({
      needsReview: false,
      categorySource: 'user',
      knowledgeBaseName: 'Procurement',
    });
    expect(await doc(notes.id)).toBeUndefined();

    const hits = (
      await req('POST', '/knowledge/search', { query: 'meeting notes next steps' })
    ).json<KnowledgeSearchResult[]>();
    expect(hits.some((h) => h.documentId === notes.id)).toBe(true);
  });

  it('auto-detects the category when uploading into a specific knowledge base', async () => {
    const body = multipart([
      {
        name: 'Purchasing policy.txt',
        data: Buffer.from(
          '# Purchasing policy\n\nAll purchases above AED 50,000 require three quotes.',
        ),
      },
    ]);
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/v1/knowledge-bases/${financeKb.id}/documents`,
      headers: { ...t.as(ADMIN), ...body.headers },
      payload: body.payload,
    });
    expect(res.statusCode).toBe(201);
    const docs = (await req('GET', `/knowledge-bases/${financeKb.id}/documents`)).json<
      KnowledgeDocument[]
    >();
    // The knowledge base chosen by the uploader is kept even though the AI preferred Procurement.
    expect(docs.find((d) => d.filename === 'Purchasing policy.txt')).toMatchObject({
      category: 'policy',
      categorySource: 'ai',
      knowledgeBaseName: 'Finance',
    });
  });

  it('falls back to file-name rules when the AI call fails', async () => {
    llm.enqueue('classify', new Error('model unavailable'));
    const res = await bulk([
      {
        name: 'Vendor onboarding SOP.txt',
        data: Buffer.from('# Vendor onboarding\n\nStep 1: request.'),
      },
    ]);
    const created = res.json<BulkUploadResult>().created[0]!;
    const d = await doc(created.id);
    expect(d).toMatchObject({
      category: 'sop',
      categorySource: 'rule',
      needsReview: true,
      knowledgeBaseId: null,
    });
    expect(d!.classificationReason).toMatch(/AI classification unavailable/);
  });
});
