export type AnswerOutcome =
  | { readonly kind: 'answered'; readonly selectedChoiceId: string }
  | { readonly kind: 'omitted' };

export function answeredOutcome(selectedChoiceId: string): AnswerOutcome {
  return {
    kind: 'answered',
    selectedChoiceId,
  };
}

export function omittedOutcome(): AnswerOutcome {
  return { kind: 'omitted' };
}

export function isOmittedOutcome(outcome: AnswerOutcome): boolean {
  return outcome.kind === 'omitted';
}

export function selectedChoiceIdOrNull(outcome: AnswerOutcome): string | null {
  return outcome.kind === 'answered' ? outcome.selectedChoiceId : null;
}
