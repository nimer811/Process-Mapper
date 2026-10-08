/**
 * Hidden "true" processes for interview evaluation. The simulated employee knows these;
 * the interviewer does not. Each scenario has an opening line, like a real user would start.
 */
export interface Scenario {
  id: string;
  processName: string;
  opening: string;
  truth: {
    steps: { id: string; name: string; actor: string; system?: string; notes?: string }[];
    decisions: string[];
    exceptions: string[];
    rules: string[];
    sla?: string[];
  };
}

export const scenarios: Scenario[] = [
  {
    id: 'vendor-onboarding',
    processName: 'Vendor onboarding',
    opening: 'I want to map our vendor onboarding process. It starts when a supplier registers on our website.',
    truth: {
      steps: [
        { id: 'T1', name: 'Supplier registers and uploads documents on the supplier portal', actor: 'Supplier', system: 'Oracle Supplier Portal', notes: 'trade licence, VAT certificate, bank letter, company profile' },
        { id: 'T2', name: 'Registration confirmation lands in Oracle queue', actor: 'System', system: 'Oracle' },
        { id: 'T3', name: 'Check documents are complete and valid', actor: 'Procurement Officer', system: 'Oracle', notes: 'within 2 working days' },
        { id: 'T4', name: 'Sanctions and compliance screening', actor: 'Compliance Analyst', system: 'World-Check' },
        { id: 'T5', name: 'Evaluate supplier capability for the category', actor: 'Category Manager', notes: 'uses evaluation scorecard' },
        { id: 'T6', name: 'Approve supplier', actor: 'Procurement Manager', notes: 'Head of Procurement for strategic suppliers' },
        { id: 'T7', name: 'Verify bank details by call-back', actor: 'Accounts Payable Officer', system: 'Phone' },
        { id: 'T8', name: 'Activate supplier in Oracle and file documents', actor: 'Master Data Specialist', system: 'Oracle', notes: 'documents filed in supplier record' },
        { id: 'T9', name: 'Send approval notification to supplier', actor: 'Procurement Officer', system: 'Email' },
      ],
      decisions: ['Documents complete? (no → request missing documents)', 'Screening clear? (hit → reject)', 'Approved or rejected by Procurement Manager'],
      exceptions: ['Incomplete documents: officer emails supplier, supplier re-uploads (often 2–3 rounds)', 'Sanctions hit: escalate to Compliance, supplier rejected'],
      rules: ['Strategic suppliers (expected spend above AED 1 million) need Head of Procurement approval', 'Bank details must be verified by call-back before activation'],
      sla: ['Document check within 2 working days', 'Whole process target 10 working days'],
    },
  },
  {
    id: 'pr-to-po',
    processName: 'Purchase requisition to PO',
    opening: 'We need to map how purchase requests become purchase orders.',
    truth: {
      steps: [
        { id: 'T1', name: 'Create purchase requisition', actor: 'Requester (any employee)', system: 'Oracle iProcurement' },
        { id: 'T2', name: 'Budget check', actor: 'System', system: 'Oracle', notes: 'automatic funds check' },
        { id: 'T3', name: 'Line manager approval', actor: 'Line Manager', system: 'Oracle' },
        { id: 'T4', name: 'Approval per delegation of authority', actor: 'Department Head / CFO / CEO by amount', system: 'Oracle' },
        { id: 'T5', name: 'Sourcing: quotations or tender', actor: 'Buyer', notes: 'depends on value' },
        { id: 'T6', name: 'Create purchase order', actor: 'Buyer', system: 'Oracle' },
        { id: 'T7', name: 'Approve purchase order', actor: 'Procurement Manager', system: 'Oracle' },
        { id: 'T8', name: 'Send PO to supplier', actor: 'Buyer', system: 'Email' },
      ],
      decisions: ['Budget available? (no → budget transfer request)', 'Approval thresholds by amount', 'Sourcing route by value'],
      exceptions: ['Insufficient budget: requester raises budget transfer, PR on hold', 'PR rejected by approver: returned to requester to amend'],
      rules: ['Up to AED 50,000: Department Head; up to 500,000: CFO; above: CEO', 'Below AED 10,000: one quote; 10,000–100,000: three quotes; above 100,000: tender'],
      sla: ['Buyer converts approved PR within 3 working days'],
    },
  },
];
