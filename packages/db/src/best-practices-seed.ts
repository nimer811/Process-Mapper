import type { PracticeCategory } from '@process-ai/shared';

/** Starter library of procurement good practices (admins edit these in the app). */
export const DEFAULT_BEST_PRACTICES: {
  title: string;
  statement: string;
  category: PracticeCategory;
  keywords: string[];
  source: string;
}[] = [
  {
    title: 'One accountable owner per process',
    statement:
      'Every process has exactly one accountable owner role, senior enough to change it, who validates it and answers for its performance and controls.',
    category: 'ownership',
    keywords: [],
    source: 'ISO 9001:2015 5.3; common process-governance practice',
  },
  {
    title: 'One accountable role per activity',
    statement:
      'Each activity has one Accountable role (RACI). Responsibility can be shared; accountability cannot.',
    category: 'ownership',
    keywords: [],
    source: 'RACI practice',
  },
  {
    title: 'Requester is not the approver',
    statement:
      'The person who raises a request (requisition, supplier registration, purchase order) must not approve it.',
    category: 'segregation_of_duties',
    keywords: ['request', 'requisition', 'purchase', 'order', 'supplier', 'vendor'],
    source: 'COSO Internal Control — Integrated Framework (control activities)',
  },
  {
    title: 'Separate supplier master data from payments',
    statement:
      'Whoever creates or changes supplier master data (including bank details) must not approve or release payments to that supplier.',
    category: 'segregation_of_duties',
    keywords: ['supplier', 'vendor', 'master', 'bank', 'payment', 'activate'],
    source: 'COSO; common procure-to-pay audit practice',
  },
  {
    title: 'Separate ordering, receiving and paying',
    statement:
      'Ordering goods or services, confirming receipt, and approving the invoice for payment are done by different roles.',
    category: 'segregation_of_duties',
    keywords: ['order', 'receipt', 'grn', 'invoice', 'payment', 'purchase'],
    source: 'COSO; three-way match practice',
  },
  {
    title: 'Approvals follow the delegation of authority',
    statement:
      'Every approval names the authorised role and the limit it applies to (amount, category or risk), in line with the delegation of authority.',
    category: 'delegation_of_authority',
    keywords: ['approve', 'approval', 'threshold', 'limit', 'aed'],
    source: 'Delegation of Authority (DoA) practice',
  },
  {
    title: 'Independent verification of bank details',
    statement:
      'New or changed supplier bank details are verified by call-back to a known contact, by someone other than the person who entered them, before any payment.',
    category: 'control',
    keywords: ['bank', 'supplier', 'vendor', 'payment', 'call-back', 'callback'],
    source: 'Common anti-fraud control (payment diversion)',
  },
  {
    title: 'Sanctions screening before onboarding and on list changes',
    statement:
      'Suppliers are screened against the UAE Local Terrorist List and UN lists before onboarding and whenever the lists change; a match freezes the case and is escalated to Compliance.',
    category: 'compliance',
    keywords: ['supplier', 'vendor', 'sanctions', 'screening', 'compliance', 'onboarding'],
    source: 'UAE Cabinet Decision 74/2020 (Targeted Financial Sanctions)',
  },
  {
    title: 'Conflict-of-interest declaration in sourcing',
    statement:
      'People who evaluate or award suppliers declare conflicts of interest before the evaluation, and anyone conflicted steps aside.',
    category: 'compliance',
    keywords: ['tender', 'sourcing', 'evaluation', 'award', 'scorecard', 'rfq'],
    source: 'ISO 37001 anti-bribery practice',
  },
  {
    title: 'Every key rule has a control with evidence',
    statement:
      'Each approval threshold or compliance rule is enforced by a named control with an owner and a record that proves it ran.',
    category: 'control',
    keywords: [],
    source: 'COSO control activities; SOX-style control matrix',
  },
  {
    title: 'Automate checks before adding approvals',
    statement:
      'Prefer system validations (completeness, duplicates, expiry dates) over extra manual review steps; keep human approval for judgement and risk.',
    category: 'efficiency',
    keywords: [],
    source: 'Lean / process-improvement practice',
  },
  {
    title: 'Clear escalation for exceptions',
    statement:
      'Each exception path names who it escalates to and within how long, so cases do not stall.',
    category: 'ownership',
    keywords: [],
    source: 'Common SOP practice',
  },
];
