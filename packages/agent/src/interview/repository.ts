import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { citationLabel } from '@process-ai/knowledge';
import {
  actors,
  documentChunks,
  documents,
  businessRules,
  departments,
  interviewMessages,
  interviewSessions,
  openItems,
  processEdges,
  processes,
  processSteps,
  processVersions,
  stepSystems,
  systems,
  type Db,
} from '@process-ai/db';
import type { InterviewState } from './state.js';

export const UNTITLED = 'Untitled process';
export const RECENT_MESSAGES = 8;

/** Loads the full interview state for one session (or null if it doesn't exist). */
export async function loadState(db: Db, sessionId: string): Promise<InterviewState | null> {
  const [row] = await db
    .select({
      session: interviewSessions,
      process: processes,
      version: processVersions,
      departmentName: departments.name,
    })
    .from(interviewSessions)
    .innerJoin(processes, eq(processes.id, interviewSessions.processId))
    .innerJoin(departments, eq(departments.id, processes.departmentId))
    .innerJoin(processVersions, eq(processVersions.id, interviewSessions.versionId))
    .where(eq(interviewSessions.id, sessionId));
  if (!row) return null;
  const { session: s, process: p, version: v } = row;

  const [steps, sys, edges, rules, items, recent] = await Promise.all([
    db
      .select({ step: processSteps, actorName: actors.name })
      .from(processSteps)
      .leftJoin(actors, eq(actors.id, processSteps.actorId))
      .where(eq(processSteps.versionId, v.id))
      .orderBy(asc(processSteps.sequence)),
    db
      .select({ stepId: stepSystems.stepId, name: systems.name })
      .from(stepSystems)
      .innerJoin(systems, eq(systems.id, stepSystems.systemId))
      .innerJoin(processSteps, eq(processSteps.id, stepSystems.stepId))
      .where(eq(processSteps.versionId, v.id)),
    db.select().from(processEdges).where(eq(processEdges.versionId, v.id)),
    db.select().from(businessRules).where(eq(businessRules.versionId, v.id)),
    db
      .select({
        item: openItems,
        chunk: {
          id: documentChunks.id,
          headingPath: documentChunks.headingPath,
          page: documentChunks.page,
          sheet: documentChunks.sheet,
        },
        doc: { id: documents.id, title: documents.title },
      })
      .from(openItems)
      .leftJoin(documentChunks, eq(documentChunks.id, openItems.chunkId))
      .leftJoin(documents, eq(documents.id, documentChunks.documentId))
      .where(
        and(
          eq(openItems.sessionId, s.id),
          inArray(openItems.status, ['open', 'asked', 'resolved', 'dismissed']),
        ),
      )
      .orderBy(asc(openItems.createdAt)),
    db
      .select({ role: interviewMessages.role, content: interviewMessages.content })
      .from(interviewMessages)
      .where(eq(interviewMessages.sessionId, s.id))
      .orderBy(desc(interviewMessages.createdAt))
      .limit(RECENT_MESSAGES),
  ]);

  return {
    session: {
      id: s.id,
      userId: s.userId,
      processId: s.processId,
      versionId: s.versionId,
      stage: s.stage,
      status: s.status,
      focusStepId: s.focusStepId,
      runningSummary: s.runningSummary,
      summarizedTurns: s.summarizedTurns,
      turnCount: s.turnCount,
      stageEnteredTurn: s.stageEnteredTurn,
    },
    process: {
      name: p.name,
      departmentId: p.departmentId,
      departmentName: row.departmentName,
      isUntitled: p.name === UNTITLED,
    },
    version: {
      description: v.description,
      purpose: v.purpose,
      trigger: v.trigger,
      endCondition: v.endCondition,
      ownerRole: v.ownerRole,
      frequency: v.frequency,
      volume: v.volume,
    },
    steps: steps.map(({ step, actorName }) => ({
      id: step.id,
      stepKey: step.stepKey,
      type: step.type,
      name: step.name,
      description: step.description,
      actorName,
      systems: sys.filter((x) => x.stepId === step.id).map((x) => x.name),
      noSystem: step.noSystem,
      inputs: step.inputs,
      outputs: step.outputs,
      execution: step.execution,
      expectedDuration: step.expectedDuration,
      sla: step.sla,
      approvalAuthority: step.approvalAuthority,
      painPoints: step.painPoints,
      provenance: step.provenance,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      fromStepId: e.fromStepId,
      toStepId: e.toStepId,
      type: e.type,
      conditionLabel: e.conditionLabel,
      provenance: e.provenance,
    })),
    rules: rules.map((r) => ({
      id: r.id,
      stepId: r.stepId,
      ruleType: r.ruleType,
      statement: r.statement,
      provenance: r.provenance,
    })),
    openItems: items.map(({ item: i, chunk, doc }) => ({
      id: i.id,
      type: i.type,
      gapKey: i.gapKey,
      source: i.source,
      entityType: i.entityType,
      entityId: i.entityId,
      field: i.field,
      description: i.description,
      priority: i.priority,
      status: i.status,
      timesAsked: i.timesAsked,
      lastAskedTurn: i.lastAskedTurn,
      rationale: i.rationale,
      citation:
        chunk?.id && doc?.id
          ? {
              chunkId: chunk.id,
              documentId: doc.id,
              label: citationLabel({ documentTitle: doc.title, ...chunk }),
            }
          : null,
    })),
    recentMessages: recent.reverse(),
  };
}
