import { describe, expect, it } from 'vitest';
import { DesignResult } from './ops.js';

describe('design schema', () => {
  it('accepts a design with mixed operations', () => {
    const parsed = DesignResult.parse({
      summary: 's',
      expected_benefits: ['b'],
      changes: [
        { op: 'remove_step', step: 'S3', rationale: 'r', opportunity: null },
        { op: 'remove_rule', rule: 'R1', rationale: 'r', opportunity: 'O1' },
      ],
    });
    expect(parsed.changes).toHaveLength(2);
  });
});
