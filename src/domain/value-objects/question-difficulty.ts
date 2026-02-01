/**
 * Question difficulty levels.
 */
export const AllDifficulties = ['easy', 'medium', 'hard'] as const;

export type QuestionDifficulty = (typeof AllDifficulties)[number];

/**
 * Type guard for difficulty validation.
 */
export function isValidDifficulty(value: string): value is QuestionDifficulty {
  return AllDifficulties.includes(value as QuestionDifficulty);
}
