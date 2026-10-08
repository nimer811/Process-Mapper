/**
 * Leading-practice checklists: what a complete version of a common process usually contains.
 * They guide the analyst's questions ("does X happen here?") — they are never recorded as facts.
 * Editable reference material; extend as the organisation learns.
 */
export interface ProcessChecklist {
  id: string;
  title: string;
  match: RegExp;
  typicalSteps: string[];
  typicalControls: string[];
  typicalExceptions: string[];
  askAbout: string[];
}

export const CHECKLISTS: ProcessChecklist[] = [
  {
    id: 'vendor-onboarding',
    title: 'Vendor / supplier onboarding',
    match: /vendor|supplier (onboard|registration|setup|set-up|creation)|onboard/i,
    typicalSteps: [
      'Request or invitation to register (who can request a new supplier, and why)',
      'Supplier registration and document upload (trade licence, VAT/tax certificate, bank letter, company profile, certifications)',
      'Duplicate check against existing suppliers',
      'Completeness and validity check of documents',
      'Due diligence: sanctions, adverse media, financial health, ownership',
      'Capability or category evaluation (scorecard, site visit, references)',
      'Risk classification (strategic / critical / standard)',
      'Approval by the right authority',
      'Bank detail verification (independent call-back)',
      'Supplier master data creation / activation in the ERP',
      'Notification to supplier and requester; filing of documents',
    ],
    typicalControls: [
      'Segregation of duties: the person who requests or evaluates a supplier is not the one who approves or creates master data',
      'Independent bank detail verification before activation',
      'Sanctions screening before approval',
      'Approval limits by risk or expected spend',
      'Periodic re-validation of supplier documents',
    ],
    typicalExceptions: [
      'Incomplete or expired documents',
      'Sanctions or compliance hit',
      'Rejected supplier',
      'Urgent / one-time supplier',
      'Changes to bank details after onboarding',
    ],
    askAbout: [
      'Who decides the supplier is approved, and on what basis',
      'How long each check takes and the overall target time',
      'Where documents are stored',
    ],
  },
  {
    id: 'pr-to-po',
    title: 'Purchase requisition to purchase order',
    match:
      /requisition|purchase order|\bpo\b|\bpr\b|purchas(e|ing) request|procure[- ]to[- ]pay|p2p/i,
    typicalSteps: [
      'Need identified and purchase requisition created (catalogue or free-text)',
      'Budget / funds check',
      'Line manager approval',
      'Approval per delegation of authority (by amount and category)',
      'Sourcing route decision (catalogue, quotations, tender, framework agreement)',
      'Supplier selection and negotiation',
      'Purchase order creation',
      'PO approval',
      'PO dispatch to supplier and acknowledgement',
    ],
    typicalControls: [
      'Approval limits by value (delegation of authority)',
      'Minimum number of quotes by value',
      'Split-order prevention',
      'No PO, no pay',
      'Segregation of duties between requester, approver and buyer',
    ],
    typicalExceptions: [
      'Insufficient budget',
      'Rejected requisition',
      'Urgent / emergency purchase',
      'Single-source justification',
      'Changes after PO is issued',
    ],
    askAbout: [
      'Thresholds that change the route',
      'How long approvals and conversion to PO take',
      'What happens with urgent requests',
    ],
  },
  {
    id: 'tendering',
    title: 'Tendering / RFQ / RFP',
    match: /tender|rfq|rfp|bid|quotation|sourcing event/i,
    typicalSteps: [
      'Requirement and specification defined',
      'Sourcing strategy and supplier shortlist',
      'RFx issued (RFQ / RFP)',
      'Clarification questions handled',
      'Bids received and opened',
      'Technical evaluation',
      'Commercial evaluation',
      'Award recommendation and approval',
      'Notification to winning and unsuccessful bidders',
      'Contract or PO issued',
    ],
    typicalControls: [
      'Sealed bid opening by a committee',
      'Separation of technical and commercial evaluation',
      'Conflict of interest declarations',
      'Award approval per delegation of authority',
    ],
    typicalExceptions: [
      'Too few bids received',
      'All bids above budget',
      'Bid clarifications or re-tender',
      'Single-source justification',
    ],
    askAbout: [
      'Evaluation criteria and weights',
      'Who sits on the evaluation committee',
      'Typical cycle time',
    ],
  },
  {
    id: 'invoice',
    title: 'Invoice processing / accounts payable',
    match: /invoice|accounts payable|\bap\b|payment/i,
    typicalSteps: [
      'Invoice received (email, portal, paper)',
      'Invoice registration / capture',
      'Matching (PO, goods receipt, invoice)',
      'Exception handling (price / quantity mismatch)',
      'Approval for non-PO invoices',
      'Posting',
      'Payment run',
      'Remittance to supplier',
    ],
    typicalControls: [
      'Three-way match',
      'Duplicate invoice check',
      'Bank detail change verification',
      'Payment approval limits',
    ],
    typicalExceptions: [
      'Mismatch with PO or goods receipt',
      'Missing PO',
      'Duplicate invoice',
      'Disputed invoice',
    ],
    askAbout: ['How invoices arrive', 'Who resolves mismatches', 'Payment terms and run frequency'],
  },
];

export const GENERIC_CHECKLIST: ProcessChecklist = {
  id: 'generic',
  title: 'Business process (general)',
  match: /.*/,
  typicalSteps: [
    'A clear trigger and intake',
    'Review or validation of what came in',
    'A decision or approval point',
    'The main work',
    'Recording the outcome in a system',
    'Notifying the people who need to know',
  ],
  typicalControls: [
    'Approval by the right authority',
    'Segregation of duties',
    'An audit trail of decisions',
  ],
  typicalExceptions: [
    'Incomplete or incorrect input',
    'Rejection at a decision point',
    'Urgent cases',
  ],
  askAbout: [
    'Who does each step (role, not department)',
    'What is checked at each review',
    'How long it takes and whether there is a target',
  ],
};

/** Picks the checklist that best fits the process being mapped. */
export function checklistFor(text: string): ProcessChecklist {
  return CHECKLISTS.find((c) => c.match.test(text)) ?? GENERIC_CHECKLIST;
}

export function renderChecklist(c: ProcessChecklist) {
  return [
    `Typical process (${c.title}) — reference only, NOT facts about this organisation:`,
    'Typical steps:',
    ...c.typicalSteps.map((s) => `- ${s}`),
    'Typical controls:',
    ...c.typicalControls.map((s) => `- ${s}`),
    'Typical exceptions:',
    ...c.typicalExceptions.map((s) => `- ${s}`),
    'Worth asking about:',
    ...c.askAbout.map((s) => `- ${s}`),
  ].join('\n');
}
