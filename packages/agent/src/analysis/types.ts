import type { IssueCategory, Level, OpportunityKind } from '@process-ai/shared';

export interface IssueFinding {
  key: string;
  stepId: string | null;
  category: IssueCategory;
  severity: Level;
  title: string;
  description: string;
  /** "user" when it restates an employee's pain point. */
  source: 'heuristic' | 'user' | 'ai';
}

export interface OpportunityFinding {
  key: string;
  stepId: string | null;
  kind: OpportunityKind;
  title: string;
  description: string;
  expectedBenefit: string | null;
  impact: Level;
  effort: Level;
  source: 'heuristic' | 'ai';
}

export interface Findings {
  issues: IssueFinding[];
  opportunities: OpportunityFinding[];
}
