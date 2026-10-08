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

const withoutNumbers = (s: string) => s.replace(/\d+(?:[.,]\d+)*/g, ' ');

/** The same rule with different figures (e.g. "above AED 50,000" vs "above AED 100,000"). */
export function conflictingRule(a: string, b: string) {
  const na = numbers(a);
  const nb = numbers(b);
  return !!na && !!nb && na !== nb && similar(withoutNumbers(a), withoutNumbers(b), 0.75);
}

/** One wording adds detail to the other ("Procurement" → "Procurement Officer"): a refinement, not a disagreement. */
export function refines(a: string, b: string) {
  // Different figures are never a refinement ("2 working days" vs "3–5 working days").
  if (numbers(a) !== numbers(b)) return false;
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return false;
  const subset = (x: Set<string>, y: Set<string>) => [...x].every((w) => y.has(w));
  return subset(wa, wb) || subset(wb, wa);
}
