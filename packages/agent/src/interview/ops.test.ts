import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ExtractionResult } from './ops.js';

describe('extraction schema', () => {
  it('is accepted by OpenAI strict structured output (no oneOf, no optional fields)', () => {
    const json = JSON.stringify(z.toJSONSchema(ExtractionResult));
    expect(json).not.toContain('"oneOf"');
    // Every object lists all its properties as required (nullable instead of optional).
    const check = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const n = node as { type?: string; properties?: Record<string, unknown>; required?: string[] };
      if (n.type === 'object' && n.properties) {
        expect(new Set(n.required ?? [])).toEqual(new Set(Object.keys(n.properties)));
      }
      Object.values(n).forEach(check);
    };
    check(z.toJSONSchema(ExtractionResult));
  });
});
