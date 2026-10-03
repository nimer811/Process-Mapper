import { and, eq } from 'drizzle-orm';
import {
  businessRules,
  designChanges,
  evidence,
  processEdges,
  processSteps,
  processVersions,
  stepSystems,
  systems,
  upsertActor,
  upsertSystem,
  type Db,
} from '@process-ai/db';
import type { DesignChangeType } from '@process-ai/shared';
import type { DesignOp } from './ops.js';

export interface AppliedDesign {
  applied: number;
  skipped: { op: string; reason: string }[];
}

/**
 * Applies a To-Be design to a cloned version, inside a transaction. Every AI-designed element is
 * marked "inferred" (a person must confirm it before validation) and every change is logged with
 * its rationale and opportunity. Invalid changes are skipped and reported, never half-applied.
 */
export async function applyDesign(
  tx: Db,
  ctx: { versionId: string; departmentId: string; opportunityIds: Map<string, string> },
  ops: DesignOp[],
): Promise<AppliedDesign> {
  const result: AppliedDesign = { applied: 0, skipped: [] };
  const steps = await tx
    .select()
    .from(processSteps)
    .where(eq(processSteps.versionId, ctx.versionId));
  const byKey = new Map(steps.map((s) => [s.stepKey.toUpperCase(), s]));
  const byId = new Map(steps.map((s) => [s.id, s]));
  const rules = await tx
    .select()
    .from(businessRules)
    .where(eq(businessRules.versionId, ctx.versionId));
  const ruleLabels = new Map(rules.map((r, i) => [`R${i + 1}`, r]));
  const refs = new Map<string, string>();
  let maxKey = Math.max(0, ...steps.map((s) => Number(/^S(\d+)$/.exec(s.stepKey)?.[1] ?? 0)));
  let maxSeq = Math.max(0, ...steps.map((s) => s.sequence ?? 0));

  const resolve = (ref: string | null) => {
    if (!ref) return null;
    const s = byKey.get(ref.trim().toUpperCase());
    if (s && byId.has(s.id)) return s.id;
    return refs.get(ref.trim()) ?? null;
  };
  const keyOf = (id: string) => byId.get(id)?.stepKey ?? '?';
  const nameOf = (id: string) => byId.get(id)?.name ?? 'step';
  const log = async (
    op: DesignOp,
    changeType: DesignChangeType,
    stepKey: string | null,
    description: string,
  ) => {
    await tx.insert(designChanges).values({
      versionId: ctx.versionId,
      changeType,
      stepKey,
      description,
      rationale: op.rationale,
      opportunityId: op.opportunity ? (ctx.opportunityIds.get(op.opportunity) ?? null) : null,
    });
    result.applied++;
  };
  const inferredEvidence = (entityType: string, entityId: string) =>
    tx
      .insert(evidence)
      .values({
        versionId: ctx.versionId,
        entityType,
        entityId,
        field: 'to_be_design',
        sourceType: 'ai_inference',
      });
  const edgesOf = () =>
    tx.select().from(processEdges).where(eq(processEdges.versionId, ctx.versionId));
  const connect = (
    from: string,
    to: string,
    type: typeof processEdges.$inferInsert.type,
    label: string | null,
  ) =>
    tx
      .insert(processEdges)
      .values({
        versionId: ctx.versionId,
        fromStepId: from,
        toStepId: to,
        type,
        conditionLabel: label,
        provenance: 'inferred',
      })
      .onConflictDoNothing();
  const skip = (op: DesignOp, reason: string) => result.skipped.push({ op: op.op, reason });

  for (const op of ops) {
    switch (op.op) {
      case 'modify_step': {
        const id = resolve(op.step);
        if (!id) {
          skip(op, `unknown step ${op.step}`);
          break;
        }
        // Models often restate unchanged values; only real differences are applied and logged.
        const current = byId.get(id)!;
        const set: Partial<typeof processSteps.$inferInsert> = { provenance: 'inferred' };
        const changed: string[] = [];
        const same = (a: unknown, b: unknown) =>
          String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
        const field = <K extends keyof typeof set & keyof typeof current>(
          k: K,
          v: (typeof set)[K] | null,
          label: string,
        ) => {
          if (v !== null && v !== undefined && !same(v, current[k])) {
            set[k] = v;
            changed.push(label);
          }
        };
        field('name', op.name, `renamed to "${op.name}"`);
        field('type', op.type, `now a ${op.type}`);
        field('description', op.description, 'description updated');
        field('execution', op.execution, `execution → ${op.execution?.replace('_', ' ')}`);
        field('sla', op.sla, `SLA → ${op.sla}`);
        field('expectedDuration', op.expected_duration, `duration → ${op.expected_duration}`);
        field('approvalAuthority', op.approval_authority, `approver → ${op.approval_authority}`);
        if (op.actor) {
          const actorId = await upsertActor(tx, op.actor, { departmentId: ctx.departmentId });
          if (actorId !== current.actorId) {
            set.actorId = actorId;
            changed.push(`owner → ${op.actor}`);
          }
        }
        const currentSystems = (
          await tx
            .select({ name: systems.name })
            .from(stepSystems)
            .innerJoin(systems, eq(systems.id, stepSystems.systemId))
            .where(eq(stepSystems.stepId, id))
        )
          .map((r) => r.name.toLowerCase())
          .sort();
        const proposedSystems = [...new Set((op.systems ?? []).map((x) => x.trim()).filter(Boolean))];
        if (
          op.systems &&
          proposedSystems.map((x) => x.toLowerCase()).sort().join('|') !== currentSystems.join('|')
        ) {
          await tx.delete(stepSystems).where(eq(stepSystems.stepId, id));
          for (const name of [...new Set(op.systems.map((x) => x.trim()).filter(Boolean))]) {
            await tx
              .insert(stepSystems)
              .values({ stepId: id, systemId: await upsertSystem(tx, name) })
              .onConflictDoNothing();
          }
          changed.push(`systems → ${proposedSystems.join(', ') || 'none'}`);
        }
        if (!changed.length) {
          skip(op, 'no changes');
          break;
        }
        const before = byId.get(id)!;
        await tx.update(processSteps).set(set).where(eq(processSteps.id, id));
        await inferredEvidence('step', id);
        await log(
          op,
          'modified',
          before.stepKey,
          `${before.stepKey} "${before.name}": ${changed.join('; ')}`,
        );
        byId.set(id, { ...before, ...set } as typeof before);
        break;
      }

      case 'remove_step': {
        const id = resolve(op.step);
        const step = id ? byId.get(id) : undefined;
        if (!id || !step) {
          skip(op, `unknown step ${op.step}`);
          break;
        }
        if (step.type === 'start') {
          skip(op, 'the start step cannot be removed');
          break;
        }
        // Reconnect the flow around the removed step.
        const edges = await edgesOf();
        const incoming = edges.filter(
          (e) => e.toStepId === id && e.fromStepId !== id && e.type !== 'loop_back',
        );
        const outgoing = edges.filter(
          (e) => e.fromStepId === id && e.toStepId !== id && e.type !== 'loop_back',
        );
        for (const i of incoming)
          for (const o of outgoing)
            if (i.fromStepId !== o.toStepId)
              await connect(i.fromStepId, o.toStepId, i.type, i.conditionLabel);
        await tx.delete(processSteps).where(eq(processSteps.id, id));
        byId.delete(id);
        await log(op, 'removed', step.stepKey, `Removed ${step.stepKey} "${step.name}"`);
        break;
      }

      case 'add_step': {
        const after = resolve(op.after);
        let before = resolve(op.before);
        if ((op.after && !after) || (op.before && !before)) {
          skip(op, 'unknown neighbouring step');
          break;
        }
        const stepKey = `S${++maxKey}`;
        const [step] = await tx
          .insert(processSteps)
          .values({
            versionId: ctx.versionId,
            stepKey,
            sequence: ++maxSeq,
            type: op.type,
            name: op.name.trim(),
            description: op.description,
            actorId: op.actor
              ? await upsertActor(tx, op.actor, { departmentId: ctx.departmentId })
              : null,
            execution: op.execution,
            sla: op.sla,
            provenance: 'inferred',
          })
          .returning();
        const id = step!.id;
        byId.set(id, step!);
        refs.set(op.ref, id);
        for (const name of [...new Set(op.systems.map((x) => x.trim()).filter(Boolean))]) {
          await tx
            .insert(stepSystems)
            .values({ stepId: id, systemId: await upsertSystem(tx, name) })
            .onConflictDoNothing();
        }
        if (after) {
          const edges = await edgesOf();
          // Insert between "after" and its next step (or the given "before").
          const forward = edges.filter(
            (e) => e.fromStepId === after && e.type !== 'loop_back' && e.type !== 'exception',
          );
          const replaced = before
            ? forward.find((e) => e.toStepId === before)
            : forward.length === 1
              ? forward[0]
              : undefined;
          if (replaced) {
            before ??= replaced.toStepId;
            await tx.delete(processEdges).where(eq(processEdges.id, replaced.id));
          }
          await connect(after, id, replaced?.type ?? 'sequence', replaced?.conditionLabel ?? null);
        }
        if (before) await connect(id, before, 'sequence', null);
        await inferredEvidence('step', id);
        const where = after ? ` after ${keyOf(after)} "${nameOf(after)}"` : '';
        await log(op, 'added', stepKey, `Added ${stepKey} "${op.name.trim()}"${where}`);
        break;
      }

      case 'add_connection': {
        const from = resolve(op.from);
        const to = resolve(op.to);
        if (!from || !to || from === to) {
          skip(op, 'invalid connection');
          break;
        }
        await connect(from, to, op.type, op.condition_label);
        await log(
          op,
          'reconnected',
          keyOf(from),
          `Connected ${keyOf(from)} → ${keyOf(to)}${op.condition_label ? ` ("${op.condition_label}")` : ''}`,
        );
        break;
      }

      case 'remove_connection': {
        const from = resolve(op.from);
        const to = resolve(op.to);
        if (!from || !to) {
          skip(op, 'invalid connection');
          break;
        }
        const removed = await tx
          .delete(processEdges)
          .where(
            and(
              eq(processEdges.versionId, ctx.versionId),
              eq(processEdges.fromStepId, from),
              eq(processEdges.toStepId, to),
            ),
          )
          .returning();
        if (!removed.length) {
          skip(op, 'connection not found');
          break;
        }
        await log(
          op,
          'reconnected',
          keyOf(from),
          `Removed connection ${keyOf(from)} → ${keyOf(to)}`,
        );
        break;
      }

      case 'add_rule': {
        const stepId = op.step ? resolve(op.step) : null;
        if (op.step && !stepId) {
          skip(op, `unknown step ${op.step}`);
          break;
        }
        const [rule] = await tx
          .insert(businessRules)
          .values({
            versionId: ctx.versionId,
            stepId,
            ruleType: op.rule_type,
            statement: op.statement.trim(),
            provenance: 'inferred',
          })
          .returning();
        await inferredEvidence('rule', rule!.id);
        await log(
          op,
          'rule_added',
          stepId ? keyOf(stepId) : null,
          `New rule: ${op.statement.trim()}`,
        );
        break;
      }

      case 'remove_rule': {
        const rule = ruleLabels.get(op.rule.trim().toUpperCase());
        if (!rule) {
          skip(op, `unknown rule ${op.rule}`);
          break;
        }
        await tx.delete(businessRules).where(eq(businessRules.id, rule.id));
        ruleLabels.delete(op.rule.trim().toUpperCase());
        await log(op, 'rule_removed', null, `Removed rule: ${rule.statement}`);
        break;
      }
    }
  }
  await tx
    .update(processVersions)
    .set({ updatedAt: new Date() })
    .where(eq(processVersions.id, ctx.versionId));
  return result;
}
