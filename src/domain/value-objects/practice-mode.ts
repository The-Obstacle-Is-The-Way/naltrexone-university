/**
 * Practice session modes.
 */
export const AllPracticeModes = ['tutor', 'exam'] as const;

export type PracticeMode = (typeof AllPracticeModes)[number];

export function isValidPracticeMode(value: string): value is PracticeMode {
  return AllPracticeModes.includes(value as PracticeMode);
}

/**
 * Determine if explanation should be shown based on mode and session state.
 * - Tutor: always show immediately
 * - Exam: only show after session ends
 */
export function shouldShowExplanation(
  mode: PracticeMode,
  sessionEnded: boolean,
): boolean {
  if (mode === 'tutor') return true;
  return sessionEnded;
}
