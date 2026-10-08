/* global process, fetch, localStorage, console */
/**
 * Live demo of "several people, one process": an admin invites a colleague to add their view on an
 * existing process, a simulated Procurement Lead (OpenAI) answers the interview — disagreeing with
 * the first interviewee on a few points — and the admin opens the AI's recommendation.
 *
 *   node apps/api/scripts/eval/live-demo-contribution.mjs .env <processId>
 *
 * Starts a new draft version first if the current one is no longer open. DEMO_BASE overrides the
 * app URL (default http://localhost:8080).
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = process.env.DEMO_BASE || 'http://localhost:8080';
const processId = process.argv[3];
const env = Object.fromEntries(
  readFileSync(process.argv[2], 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

// What the Procurement Lead believes — deliberately different from the first interview on a few points.
const truth = {
  role: 'Procurement Lead (manages the procurement team)',
  view: [
    'Document review by the Procurement Officer usually takes 3 to 5 working days, not 2, because suppliers send incomplete files',
    'Bank details are verified by call-back by the Treasury Officer, not Accounts Payable',
    'The Procurement Manager approves standard suppliers; the Head of Procurement approves strategic suppliers, which are those with expected spend above AED 500,000',
    'The Category Manager evaluates capability with the scorecard (agrees with the map)',
    'Sanctions screening by Compliance in World-Check (agrees with the map)',
  ],
};
const persona = `You are the ${truth.role}, invited to add your view to how vendor onboarding works today. What you know:
${JSON.stringify(truth.view, null, 2)}
Answer in 1–3 short sentences like a person typing. Be specific about roles, timings and thresholds when they come up, and say plainly when the description you're shown differs from your experience. If shown a summary and asked to confirm, say "Yes, that's right from my side." Never mention being simulated.`;

async function leadSays(transcript) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.LLM_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.LLM_CHAT_MODEL || 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: persona },
        ...transcript.map((m) => ({
          role: m.role === 'user' ? 'assistant' : 'user',
          content: m.content,
        })),
      ],
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(j).slice(0, 300));
  return j.choices[0].message.content.trim();
}

const users = await (await fetch(`${base}/api/v1/auth/dev-users`)).json();
const id = (email) => users.find((u) => u.email === email).id;
const admin = id('admin@processai.local');
const lead = id('owner@processai.local');
const api = async (path, userId, init = {}) => {
  const res = await fetch(`${base}/api/v1${path}`, {
    ...init,
    headers: { 'x-dev-user-id': userId, 'content-type': 'application/json', ...init.headers },
  });
  return res.status === 204 ? null : res.json();
};

// An open version to add views to.
const proc = await api(`/processes/${processId}`, admin);
const openVersion = proc.versions.find(
  (v) => v.kind === 'as_is' && (v.status === 'draft' || v.status === 'under_validation'),
);
let versionId = openVersion?.id;
if (!versionId) {
  const v = await api(`/versions/${versionId}/new-version`, admin, {
    method: 'POST',
    body: JSON.stringify({ changeSummary: 'Adding colleagues’ views' }),
  });
  versionId = v.id;
  console.log('started new version', v.versionNumber);
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--window-size=1400,950'],
});
const page = await (await browser.newContext({ viewport: { width: 1400, height: 880 } })).newPage();
const asUser = async (userId, path) => {
  await page.goto(`${base}/login`);
  await page.evaluate((v) => localStorage.setItem('process-ai.dev-user-id', v), userId);
  await page.goto(`${base}${path}`);
  await page.waitForTimeout(1800);
};

// 1. The admin invites the Procurement Lead from the process page.
await asUser(admin, `/processes/${processId}?version=${versionId}`);
await page.getByRole('button', { name: 'Invite a colleague' }).scrollIntoViewIfNeeded();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Invite a colleague' }).click();
await page.waitForTimeout(600);
await page.getByRole('combobox', { name: 'Colleague' }).click();
await page.getByRole('option', { name: 'Procurement Lead' }).click();
await page
  .getByLabel('What should they focus on? (optional)')
  .pressSequentially('approvals, bank verification and timings', { delay: 35 });
await page.waitForTimeout(700);
await page.getByRole('button', { name: 'Send invitation' }).click();
await page.waitForTimeout(2500);

// 2. The Procurement Lead finds it under My actions and starts.
await asUser(lead, '/inbox');
await page.waitForTimeout(2000);
await page.getByRole('link', { name: 'Start' }).first().click();
await page.waitForURL(/\/interviews\//);
const sessionId = page.url().split('/interviews/')[1];
console.log('contribution interview', sessionId);
await page.waitForTimeout(3000);

const getInterview = async () => api(`/interviews/${sessionId}`, lead);
for (let turn = 1; turn <= 16; turn++) {
  const before = (await getInterview()).messages.length;
  const text = await leadSays((await getInterview()).messages);
  const box = page.getByLabel('Your answer');
  await box.click();
  await box.pressSequentially(text, { delay: 16 });
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  for (let i = 0; i < 120; i++) {
    if ((await getInterview()).messages.length >= before + 2) break;
    await page.waitForTimeout(1000);
  }
  const d = await getInterview();
  console.log(
    `turn ${turn} · ${d.stage}\n  lead: ${text}\n  interviewer: ${d.messages.at(-1).content.slice(0, 220)}`,
  );
  await page.waitForTimeout(1500);
  if (d.stage === 'summary') break;
}
await page.waitForTimeout(5000);
const confirm = page.getByRole('button', { name: 'Confirm and finish' });
if (await confirm.isVisible()) {
  await confirm.click();
  await page.waitForTimeout(3000);
}

// 3. The admin sees the differences, with the AI's recommendation.
const differences = await api(`/versions/${versionId}/disagreements`, admin);
console.log(`\n${differences.length} difference(s):`);
for (const d of differences)
  console.log(
    `- ${d.subject}: "${d.current.value}" vs "${d.proposed.value}" → ${d.recommendation?.choice ?? '(recommendation pending)'}`,
  );
await asUser(admin, '/inbox');
await page.waitForTimeout(3000);
await asUser(admin, `/processes/${processId}?version=${versionId}`);
const decide = page.getByRole('button', { name: 'Review and decide' }).first();
if (await decide.isVisible()) {
  await decide.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await decide.click();
}
console.log('process page', `${base}/processes/${processId}?version=${versionId}`);
// Leave the window open to explore; closes after 10 minutes.
await page.waitForTimeout(10 * 60 * 1000);
await browser.close();
