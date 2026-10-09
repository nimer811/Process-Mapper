import type { z } from 'zod';
import type { Embedder } from '@process-ai/knowledge';

export type LlmPurpose =
  | 'extract'
  | 'analyse_turn'
  | 'respond'
  | 'summarise'
  | 'rolling_summary'
  | 'analyse'
  | 'classify'
  | 'design'
  | 'reconcile'
  | 'controls'
  | 'sop';

export interface LlmCallRecord {
  purpose: LlmPurpose;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  status: 'ok' | 'error';
  error: string | null;
}

export interface ObjectRequest<T> {
  purpose: LlmPurpose;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  /** Hard limit for this call; the request is aborted when it passes. */
  timeoutMs?: number;
}

export interface TextRequest {
  purpose: LlmPurpose;
  system: string;
  prompt: string;
}

/**
 * Provider-agnostic model access. The engine depends only on this interface, so OpenAI,
 * Azure OpenAI or a scripted mock can be swapped by configuration.
 */
export interface LlmGateway extends Embedder {
  readonly provider: string;
  generateObject<T>(req: ObjectRequest<T>, onCall?: (r: LlmCallRecord) => void): Promise<T>;
  /** Streams text chunks; the full text is the concatenation. */
  streamText(req: TextRequest, onCall?: (r: LlmCallRecord) => void): AsyncIterable<string>;
  /** Throws when the organisation's AI budget is used up (when a budget applies). */
  assertBudget?(): Promise<void>;
}

export class LlmNotConfiguredError extends Error {
  constructor() {
    super('The AI model is not configured. Set LLM_API_KEY and LLM_CHAT_MODEL.');
  }
}
