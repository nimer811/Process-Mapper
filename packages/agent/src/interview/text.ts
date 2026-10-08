const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
const numbers = (s: string) => [...(s.match(/\d+(?:[.,]\d+)*/g) ?? [])].sort().join('|');

/** Overlap of significant words between two short texts, relative to the shorter one. */
export function similar(a: string, b: string, threshold = 0.6) {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return false;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.min(wa.size, wb.size) >= threshold;
}

/** Same rule restated: mostly the same words and exactly the same figures (limits, days, amounts). */
export function sameRule(a: string, b: string) {
  return numbers(a) === numbers(b) && similar(a, b, 0.75);
}
