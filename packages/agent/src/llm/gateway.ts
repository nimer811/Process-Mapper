import type { z } from 'zod';

export type LlmPurpose = 'extract' | 'respond' | 'summarise' | 'rolling_summary' | 'analyse';

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
export interface LlmGateway {
  readonly provider: string;
  generateObject<T>(req: ObjectRequest<T>, onCall?: (r: LlmCallRecord) => void): Promise<T>;
  /** Streams text chunks; the full text is the concatenation. */
  streamText(req: TextRequest, onCall?: (r: LlmCallRecord) => void): AsyncIterable<string>;
}

export class LlmNotConfiguredError extends Error {
  constructor() {
    super('The AI model is not configured. Set LLM_API_KEY and LLM_CHAT_MODEL.');
  }
}
