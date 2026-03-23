export function getReviewVariant(
  isCorrect: boolean | null,
): 'success' | 'destructive' | 'outline' {
  if (isCorrect === true) return 'success';
  if (isCorrect === false) return 'destructive';
  return 'outline';
}

export function getReviewStatusLabel(isCorrect: boolean | null): string {
  if (isCorrect === true) return 'Correct';
  if (isCorrect === false) return 'Incorrect';
  return 'Unanswered';
}
