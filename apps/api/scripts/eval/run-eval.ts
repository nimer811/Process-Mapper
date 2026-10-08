/**
 * Interview evaluation: a simulated employee (LLM) who knows a hidden process answers the
 * interviewer through the real API; an LLM judge scores what was captured against the truth.
 *
 *   pnpm --filter @process-ai/api eval:interview [--scenario vendor-onboarding] [--max-turns 30] [--label baseline]
 *
 * Runs against the app at EVAL_BASE_URL (default http://localhost:8080). Interviews it creates are
 * deleted afterwards. Results are appended to scripts/eval/results.jsonl.
 */
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { AiSdkGateway } from '@process-ai/agent';
import { createDb, eq, interviewSessions, processes } from '@process-ai/db';
import type {
  DevUser,
  InterviewDetail,
  InterviewStreamEvent,
  VersionGraph,
} from '@process-ai/shared';
import { scenarios, type Scenario } from './scenarios.js';

const base = process.env.EVAL_BASE_URL ?? 'http://localhost:8080';
const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const maxTurns = Number(arg('max-turns') ?? 30);
const label = arg('label') ?? 'run';
const only = arg('scenario');

const llm = new AiSdkGateway({
  provider: 'openai',
  apiKey: process.env.LLM_API_KEY!,
  chatModel: process.env.LLM_CHAT_MODEL ?? 'gpt-5.4-mini',
  extractionModel: process.env.LLM_EXTRACTION_MODEL || undefined,
  embeddingModel: process.env.LLM_EMBEDDING_MODEL ?? 'text-embedding-3-small',
});

/** Retries transient failures (network blips, provider errors) with back-off, so a run isn't lost. */
async function withRetry<T>(what: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts) throw e;
      const wait = 5000 * i;
      console.warn(
        `  ${what} failed (${(e as Error).message.slice(0, 80)}); retrying in ${wait / 1000}s`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// ---------- simulated employee ----------

const PERSONA = (
  s: Scenario,
) => `You are a busy Procurement Officer being interviewed about the "${s.processName}" process. You know this process (hidden from the interviewer):

${JSON.stringify(s.truth, null, 2)}

How you answer (stay in character):
- Short, 1–2 sentences, like a busy person typing in a chat.
- Be naturally vague at first: say "Procurement" or "the team" for who does something, unless asked which role/person.
- Only describe what you're asked about. Don't volunteer the next steps, exceptions, rules or SLAs unless the question leads there.
- Use your company's terms (Oracle, the portal, World-Check) without explaining them unless asked.
- If asked about something not in your knowledge, say you're not sure.
- If the interviewer shows a summary and asks you to confirm, reply "Yes, that's right." — don't add missing items.
- Never mention that you are simulated or that there is a hidden process.`;

async function employeeReply(s: Scenario, transcript: { role: string; content: string }[]) {
  return withRetry('employee', () => employeeReplyOnce(s, transcript));
}

async function employeeReplyOnce(s: Scenario, transcript: { role: string; content: string }[]) {
  let out = '';
  for await (const chunk of llm.streamText({
    purpose: 'respond',
    system: PERSONA(s),
    prompt: `Conversation so far:\n${transcript.map((m) => `${m.role === 'user' ? 'You' : 'Interviewer'}: ${m.content}`).join('\n')}\n\nWrite your next reply only.`,
  })) {
    out += chunk;
  }
  return out.trim();
}

// ---------- API helpers ----------

async function api<T>(user: string, p: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base}/api/v1${p}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-dev-user-id': user, ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${p}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function send(user: string, id: string, text: string) {
  const res = await fetch(`${base}/api/v1/interviews/${id}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-user-id': user },
    body: JSON.stringify({ text }),
  });
  const body = await res.text();
  const events = body
    .split('\n\n')
    .map((c) => c.replace(/^data: /, '').trim())
    .filter(Boolean)
    .map((j) => JSON.parse(j) as InterviewStreamEvent);
  const state = events.find((e) => e.type === 'state');
  const message = events.find((e) => e.type === 'message');
  return {
    stage: state?.type === 'state' ? state.stage : 'unknown',
    completeness: state?.type === 'state' ? state.completeness : 0,
    reply: message?.type === 'message' ? message.message.content : '',
  };
}

// ---------- judge ----------

const Score = z.object({
  steps_recovered: z
    .array(z.string())
    .describe('Truth step ids (T1…) clearly captured by the interview'),
  actors_specific: z
    .number()
    .describe(
      'Of the captured work steps, fraction (0–1) whose owner is a specific role rather than a department/team',
    ),
  decisions_captured: z.number().int(),
  exceptions_captured: z.number().int(),
  rules_captured: z.number().int(),
  follow_up_questions: z
    .number()
    .int()
    .describe(
      'Interviewer messages that asked to clarify, elaborate, define a term, or fill a gap between steps',
    ),
  total_questions: z.number().int().describe('Interviewer messages that asked anything'),
  notes: z
    .string()
    .describe('2–3 sentences on the interviewer: what it did well and what it missed'),
});

async function judge(
  s: Scenario,
  outline: string,
  transcript: { role: string; content: string }[],
) {
  return withRetry('judge', () => judgeOnce(s, outline, transcript));
}

async function judgeOnce(
  s: Scenario,
  outline: string,
  transcript: { role: string; content: string }[],
) {
  return llm.generateObject({
    purpose: 'analyse',
    schema: Score,
    system:
      'You evaluate a process-mapping interview strictly and fairly. Compare what was captured with the true process.',
    prompt: `TRUE PROCESS\n${JSON.stringify(s.truth, null, 2)}\n\nCAPTURED PROCESS MODEL\n${outline}\n\nTRANSCRIPT\n${transcript.map((m) => `${m.role === 'user' ? 'Employee' : 'Interviewer'}: ${m.content}`).join('\n')}`,
  });
}

function outlineOf(g: VersionGraph) {
  const key = new Map(g.steps.map((s) => [s.id, s.stepKey]));
  return [
    `Trigger: ${g.trigger ?? '-'} | End: ${g.endCondition ?? '-'}`,
    ...g.steps.map(
      (s) =>
        `${s.stepKey} [${s.type}] ${s.name} — owner: ${s.actor?.name ?? '-'}; systems: ${s.systems.map((x) => x.name).join(', ') || '-'}; SLA: ${s.sla ?? '-'}`,
    ),
    ...g.edges.map(
      (e) =>
        `${key.get(e.fromStepId)} -> ${key.get(e.toStepId)} [${e.type}]${e.conditionLabel ? ` "${e.conditionLabel}"` : ''}`,
    ),
    ...g.rules.map((r) => `Rule: ${r.statement}`),
  ].join('\n');
}

// ---------- run ----------

const { db, pool } = createDb(process.env.DATABASE_URL!);
const users = (await (await fetch(`${base}/api/v1/auth/dev-users`)).json()) as DevUser[];
const employee = users.find((u) => u.email === 'employee@processai.local')!.id;
const departments = await api<{ id: string; slug: string }[]>(employee, '/departments');
const departmentId = departments.find((d) => d.slug === 'procurement')!.id;
const results: unknown[] = [];

for (const s of scenarios.filter((x) => !only || x.id === only)) {
  const started = Date.now();
  const { interview } = await api<{ interview: InterviewDetail }>(employee, '/interviews', {
    method: 'POST',
    body: JSON.stringify({ departmentId, processName: s.processName }),
  });
  const transcript: { role: string; content: string }[] = [
    { role: 'assistant', content: interview.messages[0]!.content },
  ];
  let userText = s.opening;
  let turns = 0;
  let stage = 'scoping';
  let completeness = 0;
  while (turns < maxTurns) {
    transcript.push({ role: 'user', content: userText });
    const r = await withRetry('interviewer', () => send(employee, interview.id, userText));
    turns++;
    stage = r.stage;
    completeness = r.completeness;
    transcript.push({ role: 'assistant', content: r.reply });
    process.stdout.write(`  [${s.id}] turn ${turns} · ${stage} · ${completeness}%\n`);
    if (stage === 'summary') break;
    userText = await employeeReply(s, transcript);
  }

  const graph = await api<VersionGraph>(employee, `/versions/${interview.versionId}`);
  const outline = outlineOf(graph);
  const score = await judge(s, outline, transcript);
  const result = {
    label,
    scenario: s.id,
    at: new Date().toISOString(),
    turns,
    reachedSummary: stage === 'summary',
    completeness,
    stepRecall: `${score.steps_recovered.length}/${s.truth.steps.length}`,
    stepRecallPct: Math.round((score.steps_recovered.length / s.truth.steps.length) * 100),
    actorsSpecificPct: Math.round(score.actors_specific * 100),
    decisions: `${score.decisions_captured}/${s.truth.decisions.length}`,
    exceptions: `${score.exceptions_captured}/${s.truth.exceptions.length}`,
    rules: `${score.rules_captured}/${s.truth.rules.length}`,
    followUpPct: score.total_questions
      ? Math.round((score.follow_up_questions / score.total_questions) * 100)
      : 0,
    seconds: Math.round((Date.now() - started) / 1000),
    notes: score.notes,
    capturedSteps: graph.steps.length,
  };
  results.push(result);
  console.log(JSON.stringify(result, null, 2));
  await appendFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'results.jsonl'),
    `${JSON.stringify({ ...result, transcript, outline })}\n`,
  );

  // Clean up the interview and its draft process.
  await db.delete(interviewSessions).where(eq(interviewSessions.id, interview.id));
  await db.delete(processes).where(eq(processes.id, interview.processId));
}
await pool.end();
console.table(
  results.map((r) => {
    const { notes: _n, ...rest } = r as Record<string, unknown>;
    return rest;
  }),
);
