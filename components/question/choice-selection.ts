export type ChoiceSelectionOrigin = 'pointer' | 'non-pointer';

export function shouldCommitChoiceSelection(
  origin: ChoiceSelectionOrigin | undefined,
): boolean {
  return origin !== 'non-pointer';
}
