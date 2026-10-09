import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, processVersions } from '@process-ai/db';
import type {
  HistoryEvent,
  KnowledgeDocument,
  ProcessListItem,
  ReviewState,
  Task,
} from '@process-ai/shared';
import { ADMIN, EMPLOYEE, OWNER, startTestApp } from './helpers.js';

/** Builds a multipart/form-data body for app.inject. */
function multipart(file: { name: string; data: Buffer }, fields: Record<string, string>) {
  const boundary = '----processai' + Math.random().toString(16).slice(2);
  const parts = [
    ...Object.entries(fields).map(([k, v]) =>
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`),
    ),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    file.data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  return {
    payload: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('Review cycles and change alerts', () => {
  let t: Awaited<ReturnType<typeof startTestApp>>;
  let vendor: ProcessListItem;
  let kbId: string;
  const req = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    email: string,
    payload?: object,
  ) => t.app.inject({ method, url: `/api/v1${url}`, headers: t.as(email), payload });
  const inbox = async (email: string) =>
    (await req('GET', '/tasks', email)).json<Task[]>().filter((x) => x.status === 'open');
  const upload = (name: string, text: string, fields: Record<string, string>) => {
    const body = multipart({ name, data: Buffer.from(text) }, fields);
    return t.app.inject({
      method: 'POST',
      url: `/api/v1/knowledge-bases/${kbId}/documents`,
      headers: { ...t.as(ADMIN), ...body.headers },
      payload: body.payload,
    });
  };

  beforeAll(async () => {
    t = await startTestApp();
    vendor = (await req('GET', '/processes', OWNER))
      .json<ProcessListItem[]>()
      .find((p) => p.slug === 'vendor-onboarding')!;
    kbId = (await req('POST', '/knowledge-bases', ADMIN, { name: 'Procurement' })).json<{
      id: string;
    }>().id;
  });
  afterAll(async () => {
    await t?.stop();
  });

  it('reminds the owner when a review is due and restarts the clock when reviewed', async () => {
    const ok = (await req('GET', `/processes/${vendor.id}/review`, OWNER)).json<ReviewState>();
    expect(ok).toMatchObject({ status: 'ok', cycleMonths: 12, canReview: true });

    const thirteenMonthsAgo = new Date();
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
    await t.db
      .update(processVersions)
      .set({ approvedAt: thirteenMonthsAgo })
      .where(eq(processVersions.id, vendor.versionId));
    expect(
      (await req('GET', `/processes/${vendor.id}/review`, EMPLOYEE)).json<ReviewState>(),
    ).toMatchObject({ status: 'overdue', canReview: false });
    expect((await inbox(OWNER)).find((x) => x.kind === 'review_due')!.title).toBe(
      'Review overdue: "Vendor Onboarding"',
    );

    expect((await req('POST', `/processes/${vendor.id}/review`, EMPLOYEE, {})).statusCode).toBe(
      403,
    );
    const reviewed = await req('POST', `/processes/${vendor.id}/review`, OWNER, {
      comment: 'Walked through it with the team.',
    });
    expect(reviewed.json<ReviewState>().status).toBe('ok');
    expect((await inbox(OWNER)).some((x) => x.kind === 'review_due')).toBe(false);
    const history = (await req('GET', `/versions/${vendor.versionId}/history`, OWNER)).json<
      HistoryEvent[]
    >();
    expect(
      history.some(
        (h) => h.action === 'reviewed' && h.comment === 'Walked through it with the team.',
      ),
    ).toBe(true);
  });

  it('alerts processes relying on a document when it is replaced, edited or removed', async () => {
    const res = await upload(
      'delegation-of-authority.txt',
      'Supplier approval: Procurement Manager up to AED 1,000,000.',
      {
        category: 'doa',
        processId: vendor.id,
        title: 'Delegation of Authority',
      },
    );
    expect(res.statusCode).toBe(201);
    const doc = res.json<KnowledgeDocument>();
    expect(
      (await req('GET', `/processes/${vendor.id}/review`, OWNER)).json<ReviewState>().alerts,
    ).toEqual([]);

    // A new upload with the same title is a newer version of it.
    await upload('doa-2026.txt', 'Supplier approval: Procurement Manager up to AED 500,000.', {
      category: 'doa',
      title: 'Delegation of Authority',
    });
    let review = (await req('GET', `/processes/${vendor.id}/review`, OWNER)).json<ReviewState>();
    expect(review.alerts).toHaveLength(1);
    expect(review.alerts[0]).toMatchObject({
      documentTitle: 'Delegation of Authority',
      status: 'open',
    });
    expect(review.alerts[0]!.change).toMatch(/newer version was uploaded \(doa-2026\.txt\)/);
    expect((await inbox(OWNER)).find((x) => x.kind === 'check_change')!.title).toBe(
      'Check "Vendor Onboarding": "Delegation of Authority" changed',
    );

    // Deactivating the old one updates the same open alert rather than adding another.
    await req('PATCH', `/documents/${doc.id}`, ADMIN, { isActive: false });
    review = (await req('GET', `/processes/${vendor.id}/review`, OWNER)).json<ReviewState>();
    expect(review.alerts.filter((a) => a.status === 'open')).toHaveLength(1);
    expect(review.alerts[0]!.change).toBe('The document was deactivated.');

    expect(
      (
        await req('POST', `/process-alerts/${review.alerts[0]!.id}/resolve`, EMPLOYEE, {
          resolution: 'checked',
        })
      ).statusCode,
    ).toBe(403);
    const resolved = await req('POST', `/process-alerts/${review.alerts[0]!.id}/resolve`, OWNER, {
      resolution: 'Limits already reflected in v2 draft.',
    });
    expect(resolved.json<ReviewState>().alerts[0]).toMatchObject({
      status: 'resolved',
      resolution: 'Limits already reflected in v2 draft.',
    });
    expect((await inbox(OWNER)).some((x) => x.kind === 'check_change')).toBe(false);
  });
});
