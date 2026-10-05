import { contentInDoubt } from '@/src/domain/services';
import type { QuestionAvailability } from '@/src/domain/value-objects';

/**
 * ADR-022 Amendment 2026-10-05 (DEBT-498): a graded result no score counts,
 * because its key was corrected since or its question's content is in doubt
 * (withdrawn, under review, or gone), is shown as "Not scored".
 */
export function isResultNotScored(row: {
  isCorrect: boolean | null;
  availability: QuestionAvailability | null;
  answerKeyChanged?: boolean;
}): boolean {
  return (
    row.isCorrect !== null &&
    (row.answerKeyChanged === true || contentInDoubt(row.availability))
  );
}

type ResultOptions = { notScored?: boolean };

export function getReviewVariant(
  isCorrect: boolean | null,
  { notScored = false }: ResultOptions = {},
): 'success' | 'destructive' | 'secondary' | 'outline' {
  if (isCorrect === null) return 'outline';
  if (notScored) return 'secondary';
  return isCorrect ? 'success' : 'destructive';
}

export function getReviewStatusLabel(
  isCorrect: boolean | null,
  { notScored = false }: ResultOptions = {},
): string {
  if (isCorrect === null) return 'Unanswered';
  if (notScored) return 'Not scored';
  return isCorrect ? 'Correct' : 'Incorrect';
}
