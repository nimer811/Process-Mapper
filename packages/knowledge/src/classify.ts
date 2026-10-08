import type { DocumentCategory } from '@process-ai/shared';

export interface KnowledgeBaseOption {
  id: string;
  name: string;
  description: string | null;
  departmentName: string | null;
}

export interface ClassificationInput {
  filename: string;
  /** Opening text of the document (headings and first paragraphs). */
  excerpt: string;
  /** Candidate knowledge bases; one entry means the knowledge base is already decided. */
  knowledgeBases: KnowledgeBaseOption[];
}

export interface Classification {
  category: DocumentCategory;
  knowledgeBaseId: string | null;
  title: string | null;
  docVersion: string | null;
  effectiveDate: string | null;
  /** 0–1. Low confidence sends the document to the review inbox. */
  confidence: number;
  reason: string;
}

/** Sorts uploaded documents. Implemented with the LLM gateway; rules are the fallback. */
export interface DocumentClassifier {
  classify(input: ClassificationInput): Promise<Classification>;
}

/** Below this confidence an admin should confirm the AI's choice. */
export const REVIEW_THRESHOLD = 0.6;

const RULES: [RegExp, DocumentCategory][] = [
  [/\b(do?a|delegation of authority|authority matrix|signing authority)\b/i, 'doa'],
  [/approval (matrix|limits?)|matrix/i, 'approval_matrix'],
  [/\b(sop|standard operating procedure|procedure|work instruction)s?\b/i, 'sop'],
  [/\bpolic(y|ies)\b/i, 'policy'],
  [/\bchecklist\b/i, 'checklist'],
  [/\b(form|template|request)\b/i, 'form'],
];

/** Filename/heading keyword rules, used when no AI model is configured. */
export function ruleClassify(
  filename: string,
  excerpt: string,
): { category: DocumentCategory; matched: boolean } {
  const name = filename.replace(/[_.-]+/g, ' ');
  for (const [re, category] of RULES) if (re.test(name)) return { category, matched: true };
  const head = excerpt.slice(0, 400);
  for (const [re, category] of RULES) if (re.test(head)) return { category, matched: true };
  return { category: 'other', matched: false };
}
