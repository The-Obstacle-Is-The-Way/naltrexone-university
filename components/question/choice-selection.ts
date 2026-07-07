export type ChoiceSelectionOrigin = 'pointer' | 'non-pointer';

export function shouldCommitChoiceSelection(
  origin: ChoiceSelectionOrigin,
): boolean {
  return origin === 'pointer';
}
