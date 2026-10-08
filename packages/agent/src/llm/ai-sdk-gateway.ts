import {
  embedMany,
  generateText,
  Output,
  streamText,
  type EmbeddingModel,
  type LanguageModel,
} from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAzure } from '@ai-sdk/azure';
import type {
  LlmCallRecord,
  LlmGateway,
  LlmPurpose,
  ObjectRequest,
  TextRequest,
} from './gateway.js';

export interface AiSdkGatewayConfig {
  provider: 'openai' | 'azure';
  apiKey: string;
  /** Model (OpenAI) or deployment name (Azure) for conversation. */
  chatModel: string;
  /** Optional separate model for structured extraction. */
  extractionModel?: string;
  /** Embedding model (OpenAI) or deployment (Azure). */
  embeddingModel: string;
  azureResourceName?: string;
  azureApiVersion?: string;
  timeoutMs?: number;
}

/** LlmGateway backed by the Vercel AI SDK (OpenAI or Azure OpenAI). */
export class AiSdkGateway implements LlmGateway {
  readonly provider: string;
  private readonly models: Record<'chat' | 'extract', { id: string; model: LanguageModel }>;
  private readonly timeoutMs: number;
  private readonly embedding: EmbeddingModel;

  constructor(cfg: AiSdkGatewayConfig) {
    this.provider = cfg.provider;
    this.timeoutMs = cfg.timeoutMs ?? 60_000;
    const factory =
      cfg.provider === 'azure'
        ? createAzure({
            apiKey: cfg.apiKey,
            resourceName: cfg.azureResourceName,
            apiVersion: cfg.azureApiVersion,
          })
        : createOpenAI({ apiKey: cfg.apiKey });
    const extractId = cfg.extractionModel || cfg.chatModel;
    this.embedding = factory.embedding(cfg.embeddingModel);
    this.models = {
      chat: { id: cfg.chatModel, model: factory(cfg.chatModel) },
      extract: { id: extractId, model: factory(extractId) },
    };
  }

  private pick(purpose: LlmPurpose) {
    return purpose === 'extract' ||
      purpose === 'analyse_turn' ||
      purpose === 'reconcile' ||
      purpose === 'analyse' ||
      purpose === 'design'
      ? this.models.extract
      : this.models.chat;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { embeddings } = await embedMany({ model: this.embedding, values: texts, maxRetries: 2 });
    return embeddings;
  }

  async generateObject<T>(req: ObjectRequest<T>, onCall?: (r: LlmCallRecord) => void): Promise<T> {
    const { id, model } = this.pick(req.purpose);
    const started = Date.now();
    try {
      const result = await generateText({
        model,
        system: req.system,
        prompt: req.prompt,
        output: Output.object({ schema: req.schema }),
        // Hard abort: provider-side stalls must not hold up a conversation.
        abortSignal: AbortSignal.timeout(req.timeoutMs ?? this.timeoutMs),
        maxRetries: 1,
      });
      onCall?.(this.record(req.purpose, id, started, result.usage));
      return result.output as T;
    } catch (e) {
      onCall?.(this.record(req.purpose, id, started, undefined, e));
      throw e;
    }
  }

  async *streamText(req: TextRequest, onCall?: (r: LlmCallRecord) => void): AsyncIterable<string> {
    const { id, model } = this.pick(req.purpose);
    const started = Date.now();
    let failed: unknown = null;
    const result = streamText({
      model,
      system: req.system,
      prompt: req.prompt,
      abortSignal: AbortSignal.timeout(this.timeoutMs),
      maxRetries: 1,
      onError: ({ error }) => {
        failed = error;
      },
    });
    try {
      for await (const chunk of result.textStream) yield chunk;
      if (failed) throw failed;
      onCall?.(this.record(req.purpose, id, started, await result.usage));
    } catch (e) {
      onCall?.(this.record(req.purpose, id, started, undefined, e));
      throw e;
    }
  }

  private record(
    purpose: LlmPurpose,
    model: string,
    started: number,
    usage?: { inputTokens: number | undefined; outputTokens: number | undefined },
    error?: unknown,
  ): LlmCallRecord {
    return {
      purpose,
      provider: this.provider,
      model,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      latencyMs: Date.now() - started,
      status: error ? 'error' : 'ok',
      error: error ? (error instanceof Error ? error.message : String(error)).slice(0, 500) : null,
    };
  }
}
