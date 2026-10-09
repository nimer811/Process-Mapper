/**
 * Starter process classification: the APQC Process Classification Framework (cross-industry)
 * branches for procurement and payables. Check the codes against your licensed PCF version; admins
 * can edit or extend the tree in the app.
 */
export const DEFAULT_TAXONOMY: { code: string; name: string; parent: string | null; department?: string }[] = [
  { code: '4.0', name: 'Manage Supply Chain for Physical Products', parent: null },
  { code: '4.2', name: 'Procure materials and services', parent: '4.0', department: 'procurement' },
  { code: '4.2.1', name: 'Develop sourcing strategies', parent: '4.2', department: 'procurement' },
  { code: '4.2.2', name: 'Select suppliers and develop/maintain contracts', parent: '4.2', department: 'procurement' },
  { code: '4.2.3', name: 'Order materials and services', parent: '4.2', department: 'procurement' },
  { code: '4.2.4', name: 'Appraise and develop suppliers', parent: '4.2', department: 'procurement' },
  { code: '9.0', name: 'Manage Financial Resources', parent: null },
  { code: '9.6', name: 'Process accounts payable and expense reimbursements', parent: '9.0' },
  { code: '9.6.1', name: 'Process accounts payable (AP)', parent: '9.6' },
  { code: '9.6.2', name: 'Process expense reimbursements', parent: '9.6' },
];
