import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export function selectChoiceIfAllowed(
  submitResult: SubmitAnswerOutput | null,
  setSelectedChoiceId: (choiceId: string) => void,
  choiceId: string,
): void {
  if (submitResult) return;
  setSelectedChoiceId(choiceId);
}
