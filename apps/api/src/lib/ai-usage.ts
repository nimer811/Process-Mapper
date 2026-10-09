import { AsyncLocalStorage } from 'node:async_hooks';
import type { FastifyInstance } from 'fastify';
import { gte, llmCalls, sql, type Db } from '@process-ai/db';
import type { LlmCallRecord, LlmGateway, ObjectRequest, TextRequest } from '@process-ai/agent';

/** What an AI call is about, taken from the request that triggered it (route params and user). */
export interface AiContext {
  userId?: string;
  sessionId?: string;
  versionId?: string;
  processId?: string;
}
export const aiContext = new AsyncLocalStorage<AiContext>();

export class AiBudgetExceededError extends Error {
  readonly statusCode = 429;
  constructor() {
    super('The monthly AI budget has been used up. An admin can raise it or wait for next month.');
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Records which user and process each request's AI calls belong to. */
export function registerAiContext(app: FastifyInstance) {
  app.addHook('preHandler', async (request) => {
    const id = (request.params as { id?: string } | undefined)?.id;
    const path = request.url.split('?')[0] ?? '';
    const ctx: AiContext = { userId: request.user?.id };
    if (id && UUID.test(id)) {
      if (/\/interviews\/[^/]+/.test(path)) ctx.sessionId = id;
      else if (/\/versions\/[^/]+/.test(path)) ctx.versionId = id;
      else if (/\/processes\/[^/]+/.test(path)) ctx.processId = id;
    }
    aiContext.enterWith(ctx);
  });
}

const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/**
 * Wraps the model gateway: every call (and embedding batch) is logged with who triggered it and the
 * process it was about, and calls stop once the organisation's monthly token budget is used.
 */
export class RecordingGateway implements LlmGateway {
  private usage: { at: number; tokens: number } | null = null;

  constructor(
    private readonly inner: LlmGateway,
    private readonly db: Db,
    private readonly opts: {
      /** Tokens per calendar month (UTC); 0 = no limit. */
      monthlyTokenBudget: number;
      log?: { warn(obj: object, msg: string): void };
    },
  ) {}

  get provider() {
    return this.inner.provider;
  }

  /** Tokens used this month (cached for a minute). */
  async tokensThisMonth() {
    if (this.usage && Date.now() - this.usage.at < 60_000) return this.usage.tokens;
    const [row] = await this.db
      .select({
        n: sql<number>`coalesce(sum(coalesce(${llmCalls.inputTokens}, 0) + coalesce(${llmCalls.outputTokens}, 0)), 0)`,
      })
      .from(llmCalls)
      .where(gte(llmCalls.createdAt, monthStart()));
    this.usage = { at: Date.now(), tokens: Number(row?.n ?? 0) };
    return this.usage.tokens;
  }

  async assertBudget() {
    if (
      this.opts.monthlyTokenBudget > 0 &&
      (await this.tokensThisMonth()) >= this.opts.monthlyTokenBudget
    )
      throw new AiBudgetExceededError();
  }

  private record(r: LlmCallRecord | (Omit<LlmCallRecord, 'purpose'> & { purpose: string })) {
    const ctx = aiContext.getStore() ?? {};
    const processId = ctx.processId
      ? sql`${ctx.processId}::uuid`
      : ctx.versionId
        ? sql`(select process_id from process_versions where id = ${ctx.versionId})`
        : ctx.sessionId
          ? sql`(select process_id from interview_sessions where id = ${ctx.sessionId})`
          : null;
    if (this.usage) this.usage.tokens += (r.inputTokens ?? 0) + (r.outputTokens ?? 0);
    this.db
      .insert(llmCalls)
      .values({
        ...r,
        sessionId: ctx.sessionId
          ? sql`(select id from interview_sessions where id = ${ctx.sessionId})`
          : null,
        processId,
        userId: ctx.userId ?? null,
      })
      .catch((err: unknown) => this.opts.log?.warn({ err }, 'Failed to record AI usage'));
  }

  // This wrapper is the single place calls are logged: callers' own logging callbacks are not invoked.
  async generateObject<T>(req: ObjectRequest<T>, _onCall?: (r: LlmCallRecord) => void): Promise<T> {
    await this.assertBudget();
    return this.inner.generateObject(req, (r) => this.record(r));
  }

  async *streamText(req: TextRequest, _onCall?: (r: LlmCallRecord) => void): AsyncIterable<string> {
    await this.assertBudget();
    yield* this.inner.streamText(req, (r) => this.record(r));
  }

  /** Embeddings are cheap and needed for indexing, so they are logged (estimated tokens) but not blocked. */
  async embed(texts: string[]) {
    const started = Date.now();
    try {
      const out = await this.inner.embed(texts);
      this.record({
        purpose: 'embed',
        provider: this.inner.provider,
        model: 'embedding',
        inputTokens: Math.ceil(texts.reduce((n, t) => n + t.length, 0) / 4),
        outputTokens: 0,
        latencyMs: Date.now() - started,
        status: 'ok',
        error: null,
      });
      return out;
    } catch (e) {
      this.record({
        purpose: 'embed',
        provider: this.inner.provider,
        model: 'embedding',
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - started,
        status: 'error',
        error: e instanceof Error ? e.message.slice(0, 500) : 'error',
      });
      throw e;
    }
  }
}
