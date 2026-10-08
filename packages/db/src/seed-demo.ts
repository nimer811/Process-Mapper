import { and, eq } from 'drizzle-orm';
import type {
  EdgeType,
  ExecutionMode,
  Provenance,
  StepType,
  VersionStatus,
} from '@process-ai/shared';
import type { Db } from './client.js';
import { upsertActor, upsertSystem } from './catalog.js';
import {
  businessRules,
  departments,
  evidence,
  processEdges,
  processes,
  processSteps,
  processVersions,
  stepSystems,
  users,
  validationEvents,
} from './schema/index.js';

interface StepSpec {
  key: string;
  type?: StepType;
  name: string;
  description?: string;
  actor?: string;
  actorKind?: 'role' | 'team' | 'external';
  systems?: string[];
  inputs?: string[];
  outputs?: string[];
  execution?: ExecutionMode;
  duration?: string;
  sla?: string;
  approvalAuthority?: string;
  painPoints?: string[];
  provenance?: Provenance;
  rules?: {
    type: 'threshold' | 'approval' | 'compliance' | 'sla' | 'control' | 'other';
    statement: string;
    provenance?: Provenance;
  }[];
}

interface ProcessSpec {
  name: string;
  slug: string;
  status: VersionStatus;
  description: string;
  purpose: string;
  trigger: string;
  endCondition: string;
  frequency?: string;
  volume?: string;
  steps: StepSpec[];
  edges: [from: string, to: string, type?: EdgeType, label?: string][];
}

const evidenceSourceFor = {
  stated: 'user_statement',
  documented: 'document',
  inferred: 'ai_inference',
  confirmed: 'user_validation',
  disputed: 'user_statement',
} as const;

const vendorOnboarding: ProcessSpec = {
  name: 'Vendor Onboarding',
  slug: 'vendor-onboarding',
  status: 'approved',
  description:
    'Registers a new vendor in the vendor master after document collection, compliance screening, approval and bank verification.',
  purpose: 'Ensure only legitimate, compliant vendors can be paid and used for purchasing.',
  trigger: 'A business unit needs to buy from a vendor that is not yet registered.',
  endCondition: 'Vendor is active in SAP with a vendor number, or the request is rejected.',
  frequency: 'Daily',
  volume: '~40 new vendors per month',
  steps: [
    { key: 'S1', type: 'start', name: 'Vendor onboarding requested', actor: 'Business Requester' },
    {
      key: 'S2',
      name: 'Submit vendor registration request',
      description: 'Requester submits vendor details and business justification.',
      actor: 'Business Requester',
      systems: ['Supplier Portal'],
      inputs: ['Vendor name and contact', 'Business justification'],
      outputs: ['Registration request'],
      execution: 'manual',
      duration: '15 minutes',
    },
    {
      key: 'S3',
      name: 'Check for existing vendor',
      description: 'Search the vendor master for duplicates by name, trade licence and VAT number.',
      actor: 'Procurement Officer',
      systems: ['SAP S/4HANA'],
      inputs: ['Registration request'],
      outputs: ['Duplicate check result'],
      execution: 'manual',
      duration: '10 minutes',
      sla: '1 business day',
    },
    {
      key: 'S4',
      type: 'decision',
      name: 'Vendor already registered?',
      actor: 'Procurement Officer',
    },
    {
      key: 'S5',
      name: 'Extend existing vendor to company code',
      actor: 'Master Data Team',
      actorKind: 'team',
      systems: ['SAP S/4HANA'],
      execution: 'manual',
      provenance: 'inferred',
    },
    {
      key: 'S6',
      name: 'Send registration pack to vendor',
      actor: 'Procurement Officer',
      systems: ['Supplier Portal', 'Outlook'],
      outputs: ['Registration form', 'Document checklist'],
      execution: 'semi_automated',
    },
    {
      key: 'S7',
      name: 'Vendor submits documents',
      actor: 'Vendor',
      actorKind: 'external',
      systems: ['Supplier Portal'],
      inputs: ['Registration form', 'Document checklist'],
      outputs: ['Trade licence', 'VAT certificate', 'Bank letter', 'Signed code of conduct'],
      execution: 'manual',
      sla: '5 business days',
      painPoints: ['Vendors often submit incomplete documents and are chased by email.'],
    },
    {
      key: 'S8',
      name: 'Review documents and screen vendor',
      description: 'Check completeness and validity; run sanctions and adverse-media screening.',
      actor: 'Procurement Officer',
      systems: ['Supplier Portal', 'World-Check'],
      inputs: ['Vendor documents'],
      outputs: ['Due diligence result'],
      execution: 'manual',
      duration: '45 minutes',
      sla: '3 business days',
      rules: [
        {
          type: 'compliance',
          statement: 'All new vendors must pass sanctions screening before approval.',
          provenance: 'documented',
        },
      ],
    },
    {
      key: 'S9',
      type: 'decision',
      name: 'Documents complete and compliant?',
      actor: 'Procurement Officer',
    },
    {
      key: 'S10',
      name: 'Request missing documents',
      actor: 'Procurement Officer',
      systems: ['Outlook'],
      execution: 'manual',
      painPoints: ['Back-and-forth emails add 1–2 weeks to onboarding.'],
    },
    {
      key: 'S11',
      type: 'end',
      name: 'Vendor rejected',
      actor: 'Procurement Officer',
      outputs: ['Rejection notice'],
    },
    {
      key: 'S12',
      type: 'approval',
      name: 'Approve vendor registration',
      actor: 'Procurement Manager',
      systems: ['Supplier Portal'],
      inputs: ['Due diligence result'],
      outputs: ['Approval decision'],
      sla: '2 business days',
      approvalAuthority: 'Procurement Manager; Head of Procurement for strategic vendors',
      rules: [
        {
          type: 'approval',
          statement:
            'Strategic vendors (expected annual spend above AED 1,000,000) require Head of Procurement approval.',
          provenance: 'documented',
        },
      ],
    },
    {
      key: 'S13',
      name: 'Verify bank details',
      description: 'Call-back verification of bank details using an independently sourced number.',
      actor: 'Accounts Payable',
      actorKind: 'team',
      systems: ['Phone'],
      inputs: ['Bank letter'],
      outputs: ['Verified bank details'],
      execution: 'manual',
      sla: '2 business days',
      painPoints: ['Call-backs are hard to schedule with overseas vendors.'],
      rules: [
        {
          type: 'control',
          statement:
            'Bank details must be verified by phone call-back to a number not taken from the vendor submission.',
          provenance: 'documented',
        },
      ],
    },
    {
      key: 'S14',
      name: 'Create vendor master record',
      actor: 'Master Data Team',
      actorKind: 'team',
      systems: ['SAP S/4HANA'],
      inputs: ['Approved registration', 'Verified bank details'],
      outputs: ['Vendor number'],
      execution: 'manual',
      duration: '20 minutes',
      sla: '1 business day',
      painPoints: ['Vendor data is re-keyed from the Supplier Portal into SAP.'],
    },
    {
      key: 'S15',
      type: 'end',
      name: 'Vendor active and requester notified',
      actor: 'Master Data Team',
      outputs: ['Vendor number', 'Notification email'],
    },
  ],
  edges: [
    ['S1', 'S2'],
    ['S2', 'S3'],
    ['S3', 'S4'],
    ['S4', 'S5', 'branch', 'Yes'],
    ['S4', 'S6', 'branch', 'No'],
    ['S5', 'S15'],
    ['S6', 'S7'],
    ['S7', 'S8'],
    ['S8', 'S9'],
    ['S9', 'S12', 'branch', 'Complete and compliant'],
    ['S9', 'S10', 'exception', 'Documents incomplete'],
    ['S9', 'S11', 'exception', 'Sanctions hit'],
    ['S10', 'S7', 'loop_back', 'Resubmitted'],
    ['S12', 'S13', 'branch', 'Approved'],
    ['S12', 'S11', 'branch', 'Rejected'],
    ['S13', 'S14'],
    ['S14', 'S15'],
  ],
};

const prToPo: ProcessSpec = {
  name: 'Purchase Requisition to PO',
  slug: 'purchase-requisition-to-po',
  status: 'draft',
  description: 'From an approved business need to a purchase order issued to the vendor.',
  purpose: 'Buy goods and services at the right price with proper approval.',
  trigger: 'A business user identifies a need for goods or services.',
  endCondition: 'A purchase order is sent to the vendor.',
  steps: [
    { key: 'S1', type: 'start', name: 'Business need identified', actor: 'Business Requester' },
    {
      key: 'S2',
      name: 'Create purchase requisition',
      actor: 'Business Requester',
      systems: ['SAP S/4HANA'],
      outputs: ['Purchase requisition'],
      execution: 'manual',
    },
    {
      key: 'S3',
      type: 'approval',
      name: 'Approve requisition per DoA',
      actor: 'Budget Holder',
      systems: ['SAP S/4HANA'],
      approvalAuthority: 'Per Delegation of Authority',
    },
    { key: 'S4', type: 'decision', name: 'Value above AED 50,000?', actor: 'Buyer' },
    {
      key: 'S5',
      name: 'Run request for quotation',
      actor: 'Buyer',
      systems: ['SAP Ariba'],
      provenance: 'inferred',
    },
    { key: 'S6', name: 'Create purchase order', actor: 'Buyer', systems: ['SAP S/4HANA'] },
    { key: 'S7', type: 'end', name: 'PO sent to vendor', actor: 'Buyer' },
  ],
  edges: [
    ['S1', 'S2'],
    ['S2', 'S3'],
    ['S3', 'S4', 'branch', 'Approved'],
    ['S4', 'S5', 'branch', 'Yes'],
    ['S4', 'S6', 'branch', 'No'],
    ['S5', 'S6'],
    ['S6', 'S7'],
  ],
};

async function createProcess(
  db: Db,
  spec: ProcessSpec,
  ctx: { departmentId: string; ownerId: string; adminId: string },
) {
  const exists = await db.query.processes.findFirst({
    where: and(eq(processes.departmentId, ctx.departmentId), eq(processes.slug, spec.slug)),
  });
  if (exists) return;

  await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [proc] = await tx
      .insert(processes)
      .values({
        departmentId: ctx.departmentId,
        name: spec.name,
        slug: spec.slug,
        ownerUserId: ctx.ownerId,
        createdBy: ctx.ownerId,
      })
      .returning();

    const isValidated = spec.status === 'validated' || spec.status === 'approved';
    const now = new Date();
    const [version] = await tx
      .insert(processVersions)
      .values({
        processId: proc!.id,
        versionNumber: 1,
        status: spec.status,
        description: spec.description,
        purpose: spec.purpose,
        trigger: spec.trigger,
        endCondition: spec.endCondition,
        frequency: spec.frequency,
        volume: spec.volume,
        changeSummary: 'Initial version',
        createdBy: ctx.ownerId,
        submittedAt: isValidated ? now : null,
        validatedBy: isValidated ? ctx.ownerId : null,
        validatedAt: isValidated ? now : null,
        approvedBy: spec.status === 'approved' ? ctx.adminId : null,
        approvedAt: spec.status === 'approved' ? now : null,
      })
      .returning();
    const versionId = version!.id;

    const stepIds = new Map<string, string>();
    for (const [i, s] of spec.steps.entries()) {
      const prov = s.provenance ?? (isValidated ? 'confirmed' : 'stated');
      const actorId = s.actor
        ? await upsertActor(t, s.actor, {
            kind: s.actorKind ?? 'role',
            departmentId: ctx.departmentId,
          })
        : null;
      const [step] = await tx
        .insert(processSteps)
        .values({
          versionId,
          stepKey: s.key,
          sequence: i + 1,
          type: s.type ?? 'task',
          name: s.name,
          description: s.description,
          actorId,
          inputs: s.inputs ?? [],
          outputs: s.outputs ?? [],
          execution: s.execution ?? 'unknown',
          expectedDuration: s.duration,
          sla: s.sla,
          approvalAuthority: s.approvalAuthority,
          painPoints: s.painPoints ?? [],
          provenance: prov,
        })
        .returning();
      stepIds.set(s.key, step!.id);

      for (const sys of s.systems ?? []) {
        await tx
          .insert(stepSystems)
          .values({ stepId: step!.id, systemId: await upsertSystem(t, sys) });
      }
      for (const r of s.rules ?? []) {
        await tx.insert(businessRules).values({
          versionId,
          stepId: step!.id,
          ruleType: r.type,
          statement: r.statement,
          provenance: r.provenance ?? prov,
        });
      }
      await tx.insert(evidence).values({
        versionId,
        entityType: 'step',
        entityId: step!.id,
        sourceType: evidenceSourceFor[prov],
        providedBy: prov === 'inferred' ? null : ctx.ownerId,
      });
    }

    for (const [from, to, type, label] of spec.edges) {
      await tx.insert(processEdges).values({
        versionId,
        fromStepId: stepIds.get(from)!,
        toStepId: stepIds.get(to)!,
        type: type ?? 'sequence',
        conditionLabel: label,
        provenance: isValidated ? 'confirmed' : 'stated',
      });
    }

    if (isValidated) {
      await tx
        .update(processes)
        .set({ currentVersionId: versionId })
        .where(eq(processes.id, proc!.id));
      await tx
        .insert(validationEvents)
        .values([
          { versionId, action: 'submitted', actorUserId: ctx.ownerId },
          { versionId, action: 'validated', actorUserId: ctx.ownerId },
          ...(spec.status === 'approved'
            ? [{ versionId, action: 'approved' as const, actorUserId: ctx.adminId }]
            : []),
        ]);
    }
  });
}

/** Demo processes for local development and demos. Idempotent. Not for the real pilot database. */
export async function seedDemo(db: Db) {
  const dept = await db.query.departments.findFirst({ where: eq(departments.slug, 'procurement') });
  const owner = await db.query.users.findFirst({ where: eq(users.email, 'owner@processai.local') });
  const admin = await db.query.users.findFirst({ where: eq(users.email, 'admin@processai.local') });
  if (!dept || !owner || !admin) throw new Error('Run the base seed before the demo seed');

  const ctx = { departmentId: dept.id, ownerId: owner.id, adminId: admin.id };
  await createProcess(db, vendorOnboarding, ctx);
  await createProcess(db, prToPo, ctx);
}
