/**
 * Valid choice labels (A through E).
 */
export const AllChoiceLabels = ['A', 'B', 'C', 'D', 'E'] as const;

export type ChoiceLabel = (typeof AllChoiceLabels)[number];

/**
 * Validate choice label.
 */
export function isValidChoiceLabel(value: string): value is ChoiceLabel {
  return AllChoiceLabels.includes(value as ChoiceLabel);
}
