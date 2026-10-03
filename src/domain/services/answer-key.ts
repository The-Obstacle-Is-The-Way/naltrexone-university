/** A choice as the answer key reads it. */
export type KeyChoice = {
  readonly label: string;
  readonly textMd: string;
  readonly isCorrect: boolean;
};

function keyOf(choices: readonly KeyChoice[]): string {
  return JSON.stringify(
    choices
      .filter((choice) => choice.isCorrect)
      .map((choice) => [choice.label, choice.textMd])
      .sort(),
  );
}

/**
 * ADR-022 Decision 4: whether the answer key changed between the revision an
 * attempt was graded against and the current one. The key is each correct
 * choice's label and text. The comparison is conservative: moving or
 * rewording the correct option counts as a change.
 */
export function answerKeyChanged(
  graded: readonly KeyChoice[],
  current: readonly KeyChoice[],
): boolean {
  return keyOf(graded) !== keyOf(current);
}
