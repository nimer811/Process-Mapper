import { describe, expect, it } from 'vitest';
import { DesignResult } from './ops.js';

describe('design schema', () => {
  it('accepts a design with mixed operations', () => {
    const parsed = DesignResult.parse({
      summary: 's',
      expected_benefits: ['b'],
      changes: [
        { op: 'remove_step', step: 'S3', rationale: 'r', opportunity: null, sources: [] },
        { op: 'remove_rule', rule: 'R1', rationale: 'r', opportunity: 'O1', sources: ['BP1'] },
      ],
      ownership: {
        process_owner: { role: 'Head of Procurement', rationale: 'r', sources: ['D1'] },
        raci: [
          {
            step: 'S2',
            responsible: null,
            accountable: 'Procurement Manager',
            consulted: [],
            informed: [],
            rationale: 'r',
            sources: [],
          },
        ],
      },
    });
    expect(parsed.changes).toHaveLength(2);
    expect(parsed.ownership.raci[0]!.accountable).toBe('Procurement Manager');
  });
});
