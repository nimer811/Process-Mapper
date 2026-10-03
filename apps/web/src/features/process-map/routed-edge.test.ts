import { describe, expect, it } from 'vitest';
import { labelPoint, roundedPath } from './routed-edge';

describe('routed edge', () => {
  it('puts the label on the longest horizontal run', () => {
    // short right, long down, medium right
    const pts = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 300 },
      { x: 120, y: 300 },
    ];
    expect(labelPoint(pts)).toEqual({ x: 70, y: 300 });
  });

  it('draws a path through every point', () => {
    const d = roundedPath([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
    ]);
    expect(d.startsWith('M 0 0')).toBe(true);
    expect(d.endsWith('L 50 50')).toBe(true);
  });
});
