import { describe, expect, it } from 'vitest';
import { parseDurationMinutes, parseVolumePerMonth } from './parse.js';

describe('parseDurationMinutes', () => {
  it.each([
    ['30 minutes', 30],
    ['about 2 hours', 120],
    ['1.5 h', 90],
    ['2 working days', 960],
    ['3–5 working days', 1920],
    ['3 to 5 days', 1920],
    ['a week', 2400],
    ['within one day', 480],
    ['same day', 240],
    ['Immediate', 0],
    ['automatic', 0],
  ])('%s → %d', (text, minutes) => expect(parseDurationMinutes(text)).toBe(minutes));

  it('returns null when there is no unit or number', () => {
    expect(parseDurationMinutes('it depends')).toBeNull();
    expect(parseDurationMinutes('5')).toBeNull();
    expect(parseDurationMinutes(null)).toBeNull();
  });
});

describe('parseVolumePerMonth', () => {
  it.each([
    ['about 40 per month', 40],
    ['10 a week', 43],
    ['5 per day', 105],
    ['200 a year', 17],
    ['1,200 per year', 100],
    ['daily', 21],
  ])('%s → %d', (text, n) => expect(parseVolumePerMonth(text)).toBe(n));

  it('tries volume then frequency and gives up without a period', () => {
    expect(parseVolumePerMonth('around 30', 'monthly')).toBe(30);
    expect(parseVolumePerMonth('weekly')).toBe(4.3);
    expect(parseVolumePerMonth(null, '15 per month')).toBe(15);
    expect(parseVolumePerMonth('lots')).toBeNull();
  });
});
