import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export function selectChoiceIfAllowed(
  input: { isAnswered: boolean; submitResult: SubmitAnswerOutput | null },
  setSelectedChoiceId: (choiceId: string) => void,
  choiceId: string,
): boolean {
  if (input.isAnswered) return false;
  if (input.submitResult) return false;
  setSelectedChoiceId(choiceId);
  return true;
}
