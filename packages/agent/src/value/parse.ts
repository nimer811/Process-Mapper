/** Working time: a day is 8 hours, a week 5 days, a month about 21 working days. */
export const MIN_PER_HOUR = 60;
export const MIN_PER_DAY = 8 * MIN_PER_HOUR;
const WORK_DAYS_PER_MONTH = 21;
const WEEKS_PER_MONTH = 4.33;

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  hundred: 100,
  half: 0.5,
  couple: 2,
  few: 3,
};

/** First number or range in the text ("3–5", "3 to 5", "about 40", "two") → its midpoint. */
function amount(text: string): number | null {
  const range = text.match(/(\d+(?:[.,]\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:[.,]\d+)?)/);
  if (range) return (Number(range[1]!.replace(',', '.')) + Number(range[2]!.replace(',', '.'))) / 2;
  const num = text.match(/(\d+(?:[.,]\d+)?)/);
  if (num) return Number(num[1]!.replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
  const word = text.match(new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`));
  return word ? NUMBER_WORDS[word[1]!]! : null;
}

/**
 * Working minutes from how people describe time: "30 minutes", "2 hours", "3–5 working days",
 * "a week", "same day", "immediately". Ranges use the midpoint. Null when it can't tell.
 */
export function parseDurationMinutes(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\b(immediate(ly)?|instant(ly)?|real[- ]time|automatic(ally)?)\b/.test(t)) return 0;
  if (/\bsame[- ]day\b/.test(t)) return MIN_PER_DAY / 2;
  if (/\bnext[- ]day\b|\bovernight\b/.test(t)) return MIN_PER_DAY;
  const n = amount(t);
  if (n === null) return null;
  if (/\b(sec|second)/.test(t)) return Math.round(n / 60);
  if (/\b(min|mins|minute|minutes)\b/.test(t)) return Math.round(n);
  if (/\b(h|hr|hrs|hour|hours)\b/.test(t)) return Math.round(n * MIN_PER_HOUR);
  if (/\b(day|days)\b/.test(t)) return Math.round(n * MIN_PER_DAY);
  if (/\b(week|weeks|wk|wks)\b/.test(t)) return Math.round(n * 5 * MIN_PER_DAY);
  if (/\b(month|months)\b/.test(t)) return Math.round(n * WORK_DAYS_PER_MONTH * MIN_PER_DAY);
  return null;
}

/**
 * Cases per month from volume or frequency: "about 40 per month", "10 a week", "5 per day",
 * "200 a year", "daily", "weekly". Null when it can't tell.
 */
export function parseVolumePerMonth(...texts: (string | null | undefined)[]): number | null {
  // A number without a period ("around 30") takes the period from another text ("monthly").
  let pending: number | null = null;
  const periodOf = (t: string, hasNumber: boolean): number | null => {
    const p = (unit: string, word: string) =>
      new RegExp(
        `\\b(per|a|each|every|/)\\s*(working\\s+)?(${unit})\\b|\\b${word}\\b${hasNumber ? '' : `|\\bevery ${unit.split('|')[0]}\\b`}`,
      ).test(t);
    if (p('day|daily', 'daily')) return WORK_DAYS_PER_MONTH;
    if (p('week|wk', 'weekly')) return WEEKS_PER_MONTH;
    if (p('year|yr|annum', 'annually|yearly|annual')) return 1 / 12;
    if (p('quarter', 'quarterly')) return 1 / 3;
    if (p('month|mo', 'monthly')) return 1;
    return null;
  };
  const round = (x: number) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10);
  for (const text of texts) {
    if (!text) continue;
    const t = text.toLowerCase();
    const n = amount(t);
    const period = periodOf(t, n !== null);
    if (n !== null && period !== null) return round(n * period);
    if (n !== null) pending ??= n;
    else if (period !== null) return round((pending ?? 1) * period);
  }
  return null;
}

/** "1 d 2 h", "45 min" for display (working time). */
export function formatMinutes(min: number | null): string {
  if (min === null) return '—';
  if (min < MIN_PER_HOUR) return `${Math.round(min)} min`;
  if (min < MIN_PER_DAY) return `${Math.round((min / MIN_PER_HOUR) * 10) / 10} h`;
  return `${Math.round((min / MIN_PER_DAY) * 10) / 10} d`;
}
