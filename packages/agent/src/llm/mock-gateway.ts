import { HashEmbedder } from '@process-ai/knowledge';
import type { LlmCallRecord, LlmGateway, LlmPurpose, ObjectRequest, TextRequest } from './gateway.js';

type Handler = (req: { system: string; prompt: string }) => unknown;

/**
 * Scripted gateway for tests and offline demos. Provide a handler per purpose, or queue
 * responses that are consumed in order.
 */
export class MockGateway implements LlmGateway {
  readonly provider = 'mock';
  private readonly embedder = new HashEmbedder();
  readonly calls: { purpose: LlmPurpose; system: string; prompt: string }[] = [];
  private readonly queues = new Map<LlmPurpose, unknown[]>();

  constructor(private readonly handlers: Partial<Record<LlmPurpose, Handler>> = {}) {}

  /**
   * Queue the next responses for a purpose (objects for extract, strings for respond), or a
   * function that builds the response from the request.
   */
  enqueue(purpose: LlmPurpose, ...responses: unknown[]) {
    this.queues.set(purpose, [...(this.queues.get(purpose) ?? []), ...responses]);
    return this;
  }

  private next(purpose: LlmPurpose, req: { system: string; prompt: string }) {
    this.calls.push({ purpose, ...req });
    const queued = this.queues.get(purpose);
    if (queued?.length) {
      const value = queued.shift();
      if (value instanceof Error) throw value;
      return typeof value === 'function' ? (value as Handler)(req) : value;
    }
    const handler = this.handlers[purpose];
    if (handler) return handler(req);
    if (purpose === 'extract') return { ops: [], user_intent: 'continue' };
    return 'Thanks. Could you tell me more?';
  }

  embed(texts: string[]) {
    return this.embedder.embed(texts);
  }

  private record(purpose: LlmPurpose): LlmCallRecord {
    return { purpose, provider: 'mock', model: 'mock', inputTokens: 0, outputTokens: 0, latencyMs: 0, status: 'ok', error: null };
  }

  async generateObject<T>(req: ObjectRequest<T>, onCall?: (r: LlmCallRecord) => void): Promise<T> {
    const value = this.next(req.purpose, req);
    onCall?.(this.record(req.purpose));
    return req.schema.parse(value);
  }

  async *streamText(req: TextRequest, onCall?: (r: LlmCallRecord) => void): AsyncIterable<string> {
    const text = String(this.next(req.purpose, req));
    for (const word of text.split(/(?<= )/)) yield word;
    onCall?.(this.record(req.purpose));
  }
}
