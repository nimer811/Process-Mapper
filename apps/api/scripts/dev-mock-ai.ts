/**
 * Developer-only: runs the API with a rule-based mock interviewer instead of a real model,
 * for working on the interview UI without an API key. Never used in production or Docker.
 *
 *   pnpm --filter @process-ai/api dev:mock-ai
 */
import { MockGateway } from '@process-ai/agent';
import { createDb } from '@process-ai/db';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const latest = (prompt: string) => /<<<\n([\s\S]*?)\n>>>/.exec(prompt)?.[1] ?? '';

const llm = new MockGateway({
  extract: ({ prompt }) => {
    const text = latest(prompt);
    if (/\b(done|that's all|that is all|finished)\b/i.test(text))
      return { ops: [], user_intent: 'finish' };
    const keys = [...prompt.matchAll(/^S(\d+) \[/gm)].map((m) => Number(m[1]));
    const last = keys.length ? `S${Math.max(...keys)}` : null;
    const name = text
      .split(/\s+/)
      .slice(0, 6)
      .join(' ')
      .replace(/[.,;:!?]+$/, '');
    return {
      user_intent: 'continue',
      ops: [
        {
          op: 'add_step',
          ref: 'new1',
          type: last ? 'task' : 'start',
          name: name.charAt(0).toUpperCase() + name.slice(1),
          description: null,
          actor: /\bby (?:the )?([A-Z][\w ]+)/.exec(text)?.[1] ?? null,
          systems: /\b(SAP|Ariba|Oracle|Excel|email)\b/i.exec(text)?.slice(1, 2) ?? [],
          inputs: [],
          outputs: [],
          execution: 'unknown',
          expected_duration: null,
          sla: null,
          approval_authority: null,
          after: last,
          after_label: null,
          provenance: 'stated',
          quote: text.slice(0, 30),
        },
      ],
    };
  },
  respond: ({ prompt }) =>
    `[Mock AI] Got it. ${/Ask next \(only these\):\n1\. (.*)/.exec(prompt)?.[1] ?? 'Anything else?'}`,
  summarise: () => '[Mock AI] Here is a summary of what we captured. Does it look right?',
  rolling_summary: () => 'Mock summary.',
});

const config = loadConfig();
const { db } = createDb(config.DATABASE_URL);
const app = await buildApp({ config, db, llm });
await app.listen({ port: config.PORT, host: config.HOST });
app.log.warn('Running with the MOCK interviewer (no real AI).');
