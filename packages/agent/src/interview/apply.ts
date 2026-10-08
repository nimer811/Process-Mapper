import { and, eq, sql } from 'drizzle-orm';
import {
  businessRules,
  evidence,
  normalizeName,
  openItems,
  processEdges,
  processes,
  processSteps,
  processVersions,
  stepSystems,
  upsertActor,
  upsertSystem,
  type Db,
} from '@process-ai/db';
import type { Provenance } from '@process-ai/shared';
import type { InterviewState } from './state.js';
import type { StepTarget, ValidOp } from './validate.js';

export interface ApplyContext {
  state: InterviewState;
  /** Message the facts came from; null for facts entered outside a message (e.g. the start form). */
  messageId: string | null;
  userId: string;
  departmentId: string;
}

export interface ApplyResult {
  /** Human-readable changes, for the reply writer and the message metadata. */
  changes: string[];
  /** New focus step, if the turn set one. */
  focusStepId?: string | null;
}

const PRIORITY = { high: 85, medium: 60, low: 35 } as const;

const fieldColumn = {
  description: 'description',
  purpose: 'purpose',
  trigger: 'trigger',
  end_condition: 'endCondition',
  owner_role: 'ownerRole',
  frequency: 'frequency',
  volume: 'volume',
} as const;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'process';

const uniq = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = normalizeName(x);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Applies validated ops to the draft version inside one transaction, recording evidence for every
 * fact (which message, which words, who said it, or that the AI inferred it).
 */
export async function applyOps(tx: Db, ctx: ApplyContext, ops: ValidOp[]): Promise<ApplyResult> {
  const { state } = ctx;
  const versionId = state.session.versionId;
  const changes: string[] = [];
  const refIds = new Map<string, string>();
  let focusStepId: string | null | undefined;
  const stepById = new Map(state.steps.map((s) => [s.id, s]));
  let maxKey = Math.max(0, ...state.steps.map((s) => Number(/^S(\d+)$/.exec(s.stepKey)?.[1] ?? 0)));
  let maxSeq = state.steps.length;

  const idOf = (t: StepTarget | null | undefined) =>
    !t ? null : t.kind === 'existing' ? t.id : (refIds.get(t.ref) ?? null);
  const nameOf = (id: string | null) =>
    id ? (stepById.get(id)?.name ?? newNames.get(id) ?? 'step') : 'process';
  const newNames = new Map<string, string>();
  const typeOf = (id: string) => stepById.get(id)?.type ?? newTypes.get(id);
  const newTypes = new Map<string, string>();

  const recordEvidence = async (
    entityType: string,
    entityId: string,
    prov: ValidOp['finalProvenance'],
    quote: string | null,
    field: string | null = null,
    chunkId: string | null = null,
  ) => {
    await tx.insert(evidence).values({
      versionId,
      entityType,
      entityId,
      field,
      sourceType:
        prov === 'stated' ? 'user_statement' : prov === 'documented' ? 'document' : 'ai_inference',
      messageId: ctx.messageId,
      chunkId,
      quote: prov === 'stated' ? quote : null,
      providedBy: prov === 'stated' ? ctx.userId : null,
    });
  };

  const insertEdge = async (
    from: string,
    to: string,
    type: typeof processEdges.$inferInsert.type,
    label: string | null,
    prov: Provenance,
  ) => {
    const [edge] = await tx
      .insert(processEdges)
      .values({
        versionId,
        fromStepId: from,
        toStepId: to,
        type,
        conditionLabel: label,
        provenance: prov,
      })
      .onConflictDoNothing()
      .returning();
    return edge;
  };

  for (const op of ops) {
    const prov = op.finalProvenance;
    const quote = 'quote' in op ? op.quote : null;

    switch (op.op) {
      case 'set_process_field': {
        // Models often repeat facts they already gave; don't re-record unchanged values.
        const current =
          op.field === 'name' ? state.process.name : state.version[fieldColumn[op.field]];
        if (current && normalizeName(current) === normalizeName(op.value)) break;
        if (op.field === 'name') {
          const name = op.value.trim().slice(0, 120);
          // Interviews build first drafts, so the URL slug follows the name.
          const base = slugify(name);
          const taken = await tx
            .select({ slug: processes.slug })
            .from(processes)
            .where(
              and(
                sql`${processes.slug} like ${base + '%'}`,
                sql`${processes.id} <> ${state.session.processId}`,
              ),
            );
          const slugs = new Set(taken.map((t) => t.slug));
          let slug = base;
          for (let n = 2; slugs.has(slug); n++) slug = `${base}-${n}`;
          await tx
            .update(processes)
            .set({ name, slug })
            .where(eq(processes.id, state.session.processId));
          changes.push(`Named the process "${name}"`);
        } else {
          await tx
            .update(processVersions)
            .set({ [fieldColumn[op.field]]: op.value.trim() })
            .where(eq(processVersions.id, versionId));
          changes.push(`Recorded ${op.field.replace('_', ' ')}: ${op.value.trim()}`);
        }
        await recordEvidence('process_version', versionId, prov, quote, op.field);
        break;
      }

      case 'add_step': {
        const stepKey = `S${++maxKey}`;
        const actorId = op.actor
          ? await upsertActor(tx, op.actor, { departmentId: ctx.departmentId })
          : null;
        const [step] = await tx
          .insert(processSteps)
          .values({
            versionId,
            stepKey,
            sequence: ++maxSeq,
            type: op.type,
            name: op.name.trim(),
            description: op.description,
            actorId,
            inputs: uniq(op.inputs),
            outputs: uniq(op.outputs),
            execution: op.execution,
            expectedDuration: op.expected_duration,
            sla: op.sla,
            approvalAuthority: op.approval_authority,
            provenance: prov,
          })
          .returning();
        const id = step!.id;
        refIds.set(op.ref, id);
        newNames.set(id, step!.name);
        newTypes.set(id, step!.type);
        for (const name of uniq(op.systems)) {
          await tx
            .insert(stepSystems)
            .values({ stepId: id, systemId: await upsertSystem(tx, name) })
            .onConflictDoNothing();
        }
        const after = idOf(op.targets.after);
        if (after) {
          const fromDecision = typeOf(after) === 'decision';
          await insertEdge(
            after,
            id,
            fromDecision || op.after_label ? 'branch' : 'sequence',
            op.after_label,
            prov,
          );
        }
        await recordEvidence('step', id, prov, quote);
        focusStepId = id;
        changes.push(
          `Added ${op.type === 'task' ? 'step' : op.type} "${step!.name}"${prov === 'inferred' ? ' (inferred)' : ''}`,
        );
        break;
      }

      case 'update_step': {
        const id = idOf(op.targets.step)!;
        const current = stepById.get(id);
        const set: Partial<typeof processSteps.$inferInsert> = {};
        if (op.name) set.name = op.name.trim();
        if (op.type) set.type = op.type;
        if (op.description) set.description = op.description;
        if (op.actor)
          set.actorId = await upsertActor(tx, op.actor, { departmentId: ctx.departmentId });
        if (op.no_system) set.noSystem = true;
        if (op.add_inputs.length) set.inputs = uniq([...(current?.inputs ?? []), ...op.add_inputs]);
        if (op.add_outputs.length)
          set.outputs = uniq([...(current?.outputs ?? []), ...op.add_outputs]);
        if (op.execution) set.execution = op.execution;
        if (op.expected_duration) set.expectedDuration = op.expected_duration;
        if (op.sla) set.sla = op.sla;
        if (op.approval_authority) set.approvalAuthority = op.approval_authority;
        // The employee talking about an AI-inferred step in their own words makes it stated.
        if (prov === 'stated' && current?.provenance === 'inferred') set.provenance = 'stated';
        if (Object.keys(set).length)
          await tx.update(processSteps).set(set).where(eq(processSteps.id, id));
        for (const name of uniq(op.add_systems)) {
          await tx
            .insert(stepSystems)
            .values({ stepId: id, systemId: await upsertSystem(tx, name) })
            .onConflictDoNothing();
        }
        const fields = [
          ...Object.keys(set).filter((k) => k !== 'provenance'),
          ...(op.add_systems.length ? ['systems'] : []),
        ];
        if (fields.length) {
          await recordEvidence('step', id, prov, quote, fields.join(','));
          changes.push(`Updated "${nameOf(id)}" (${fields.join(', ')})`);
        }
        break;
      }

      case 'add_edge': {
        const from = idOf(op.targets.from)!;
        const to = idOf(op.targets.to)!;
        const type = op.type === 'sequence' && typeOf(from) === 'decision' ? 'branch' : op.type;
        const edge = await insertEdge(from, to, type, op.condition_label, prov);
        if (edge) {
          await recordEvidence('edge', edge.id, prov, quote);
          changes.push(
            `Connected "${nameOf(from)}" → "${nameOf(to)}"${op.condition_label ? ` when "${op.condition_label}"` : ''}`,
          );
        }
        break;
      }

      case 'remove_edge': {
        const from = idOf(op.targets.from)!;
        const to = idOf(op.targets.to)!;
        const removed = await tx
          .delete(processEdges)
          .where(
            and(
              eq(processEdges.versionId, versionId),
              eq(processEdges.fromStepId, from),
              eq(processEdges.toStepId, to),
            ),
          )
          .returning();
        if (removed.length)
          changes.push(`Removed connection "${nameOf(from)}" → "${nameOf(to)}" (${op.reason})`);
        break;
      }

      case 'remove_step': {
        const id = idOf(op.targets.step)!;
        const name = nameOf(id);
        await tx
          .delete(processSteps)
          .where(and(eq(processSteps.id, id), eq(processSteps.versionId, versionId)));
        await tx
          .update(openItems)
          .set({ status: 'resolved', resolution: 'step removed' })
          .where(eq(openItems.entityId, id));
        if (state.session.focusStepId === id || focusStepId === id) focusStepId = null;
        changes.push(`Removed step "${name}" (${op.reason})`);
        break;
      }

      case 'add_rule': {
        const stepId = idOf(op.targets.step);
        const [rule] = await tx
          .insert(businessRules)
          .values({
            versionId,
            stepId,
            ruleType: op.rule_type,
            statement: op.statement.trim(),
            provenance: prov,
          })
          .returning();
        await recordEvidence('rule', rule!.id, prov, quote, null, op.sourceChunkId ?? null);
        changes.push(
          `Recorded ${prov === 'documented' ? 'SOP rule' : 'rule'}: ${op.statement.trim()}`,
        );
        break;
      }

      case 'add_pain_point': {
        const id = idOf(op.targets.step)!;
        await tx
          .update(processSteps)
          .set({ painPoints: sql`array_append(${processSteps.painPoints}, ${op.text.trim()})` })
          .where(eq(processSteps.id, id));
        await recordEvidence('step', id, prov, quote, 'pain_points');
        changes.push(`Noted pain point on "${nameOf(id)}"`);
        break;
      }

      case 'resolve_open_item': {
        await tx
          .update(openItems)
          .set({ status: 'resolved', resolution: op.resolution })
          .where(and(eq(openItems.id, op.openItemId!), eq(openItems.sessionId, state.session.id)));
        // The employee confirmed a read-back: the inferred element is now their statement.
        const item = state.openItems.find((i) => i.id === op.openItemId);
        const [, kind, entityId] = item?.gapKey?.split(':') ?? [];
        if (item?.gapKey?.startsWith('confirm:') && entityId) {
          const table = kind === 'step' ? processSteps : kind === 'edge' ? processEdges : businessRules;
          const updated = await tx
            .update(table)
            .set({ provenance: 'stated' })
            .where(and(eq(table.id, entityId), eq(table.versionId, versionId), eq(table.provenance, 'inferred')))
            .returning({ id: table.id });
          if (updated.length) {
            await recordEvidence(kind!, entityId, 'stated', op.resolution, 'confirmed');
            changes.push(`Confirmed: ${item.description.replace(/^Confirm (that )?/, '')}`);
          }
        }
        break;
      }

      case 'raise_item': {
        const stepId = idOf(op.targets.step);
        await tx.insert(openItems).values({
          sessionId: state.session.id,
          versionId,
          type: op.type,
          source: 'extractor',
          entityType: stepId ? 'step' : 'process',
          entityId: stepId,
          description: op.description.trim(),
          chunkId: op.sourceChunkId ?? null,
          priority: PRIORITY[op.priority],
        });
        if (op.type === 'contradiction') changes.push(`Flagged a difference from the SOP`);
        break;
      }

      case 'set_focus':
        focusStepId = idOf(op.targets.step);
        break;
    }
  }

  return { changes, focusStepId };
}
