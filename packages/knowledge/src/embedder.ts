import { EMBEDDING_DIMENSIONS } from '@process-ai/shared';

/** Turns text into vectors. Implemented by the LLM gateway (OpenAI / Azure OpenAI). */
export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Deterministic bag-of-words embedder for tests and offline development: texts that share words
 * get similar vectors, which is enough to exercise retrieval without calling a model.
 */
export class HashEmbedder implements Embedder {
  async embed(texts: string[]) {
    return texts.map((t) => {
      const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
      for (const word of t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
        let h = 2166136261;
        for (const ch of word) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
        v[Math.abs(h) % EMBEDDING_DIMENSIONS]! += 1;
      }
      const norm = Math.hypot(...v) || 1;
      return v.map((x) => x / norm);
    });
  }
}
