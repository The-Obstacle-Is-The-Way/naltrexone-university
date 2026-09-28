import type { Sha256Hasher } from '@/src/application/ports/sha256-hasher';
import type { QuestionDifficulty } from '@/src/domain/value-objects';

// ADR-021: a question revision's content hash is SHA-256 over the canonical
// JSON of exactly the fields the app stores and renders. Keys are sorted at
// every level, there is no insignificant whitespace, and strings are escaped
// as ECMAScript's JSON.stringify escapes them, which is byte-identical to
// Python's json.dumps(sort_keys=True, separators=(",", ":"),
// ensure_ascii=False). Choices are ordered by sort order. Row identities
// (question, revision and choice ids) and taxonomy are not content and are
// left out.
export const QUESTION_REVISION_CANONICALIZATION = 'stored-fields-json-v1';

export type QuestionRevisionChoiceFields = {
  label: string;
  sortOrder: number;
  textMd: string;
  isCorrect: boolean;
  explanationMd: string | null;
};

export type QuestionRevisionFields = {
  stemMd: string;
  explanationMd: string;
  referenceMd: string | null;
  difficulty: QuestionDifficulty;
  choices: readonly QuestionRevisionChoiceFields[];
};

type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

function sortedKeyJson(value: CanonicalValue): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(sortedKeyJson).join(',')}]`;
  }
  // Keys compare by UTF-16 code unit, as Python's sort does for these ASCII
  // keys; keys are unique, so no two compare equal.
  const entries = Object.entries(value)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, member]) => `${JSON.stringify(key)}:${sortedKeyJson(member)}`);
  return `{${entries.join(',')}}`;
}

export function canonicalQuestionRevisionJson(
  fields: QuestionRevisionFields,
): string {
  const choices = [...fields.choices]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((choice) => ({
      explanation_md: choice.explanationMd,
      is_correct: choice.isCorrect,
      label: choice.label,
      sort_order: choice.sortOrder,
      text_md: choice.textMd,
    }));
  return sortedKeyJson({
    choices,
    difficulty: fields.difficulty,
    explanation_md: fields.explanationMd,
    reference_md: fields.referenceMd,
    stem_md: fields.stemMd,
  });
}

export function questionRevisionContentHash(
  fields: QuestionRevisionFields,
  hasher: Sha256Hasher,
): string {
  return hasher.hash(canonicalQuestionRevisionJson(fields));
}
