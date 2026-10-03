import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import {
  channels,
  interviewStages,
  interviewStatuses,
  openItemStatuses,
  openItemTypes,
} from '@process-ai/shared';
import { id, timestamps } from './columns.js';
import { users } from './identity.js';
import { processes, processSteps, processVersions } from './process.js';

export const interviewStage = pgEnum('interview_stage', interviewStages);
export const interviewStatus = pgEnum('interview_status', interviewStatuses);
export const openItemType = pgEnum('open_item_type', openItemTypes);
export const openItemStatus = pgEnum('open_item_status', openItemStatuses);
export const channel = pgEnum('channel', channels);

export const interviewSessions = pgTable(
  'interview_sessions',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    processId: uuid()
      .notNull()
      .references(() => processes.id),
    /** The draft version this interview builds. */
    versionId: uuid()
      .notNull()
      .references(() => processVersions.id),
    channel: channel().notNull().default('web'),
    stage: interviewStage().notNull().default('scoping'),
    status: interviewStatus().notNull().default('active'),
    /** Step the conversation is currently about. */
    focusStepId: uuid().references(() => processSteps.id, { onDelete: 'set null' }),
    /** Compressed history of messages older than the recent window. */
    runningSummary: text(),
    /** Number of user turns already folded into the running summary. */
    summarizedTurns: integer().notNull().default(0),
    turnCount: integer().notNull().default(0),
    /** Turn number when the stage last changed (for stage time-boxing). */
    stageEnteredTurn: integer().notNull().default(0),
    lastActivityAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index().on(t.userId), index().on(t.processId)],
);

export const interviewMessages = pgTable(
  'interview_messages',
  {
    id: id(),
    sessionId: uuid()
      .notNull()
      .references(() => interviewSessions.id, { onDelete: 'cascade' }),
    role: text({ enum: ['user', 'assistant'] }).notNull(),
    content: text().notNull(),
    authorUserId: uuid().references(() => users.id),
    channel: channel().notNull().default('web'),
    /** Asked open-item ids, applied/rejected op summaries, token usage. */
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.sessionId, t.createdAt)],
);

/** Interview state that isn't process content: gaps, questions, ambiguities, contradictions, assumptions. */
export const openItems = pgTable(
  'open_items',
  {
    id: id(),
    sessionId: uuid()
      .notNull()
      .references(() => interviewSessions.id, { onDelete: 'cascade' }),
    versionId: uuid()
      .notNull()
      .references(() => processVersions.id, { onDelete: 'cascade' }),
    type: openItemType().notNull(),
    /** Stable key for deterministic gaps (e.g. "step:<id>:actor") so they aren't duplicated. */
    gapKey: text(),
    source: text({ enum: ['gap_analysis', 'probe', 'extractor'] }).notNull(),
    entityType: text(),
    entityId: uuid(),
    field: text(),
    description: text().notNull(),
    /** SOP passage behind a contradiction (FK added in migration). */
    chunkId: uuid(),
    priority: integer().notNull().default(50),
    status: openItemStatus().notNull().default('open'),
    timesAsked: integer().notNull().default(0),
    lastAskedTurn: integer(),
    resolution: text(),
    ...timestamps,
  },
  (t) => [unique().on(t.sessionId, t.gapKey), index().on(t.sessionId, t.status)],
);

/** Usage metadata for every model call (no prompt content). */
export const llmCalls = pgTable(
  'llm_calls',
  {
    id: id(),
    sessionId: uuid().references(() => interviewSessions.id, { onDelete: 'set null' }),
    purpose: text().notNull(),
    provider: text().notNull(),
    model: text().notNull(),
    inputTokens: integer(),
    outputTokens: integer(),
    latencyMs: integer().notNull(),
    status: text({ enum: ['ok', 'error'] }).notNull(),
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.sessionId), index().on(t.createdAt)],
);
