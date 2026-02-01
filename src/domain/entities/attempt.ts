/**
 * Attempt entity - a user's answer to a question.
 */
export type Attempt = {
  readonly id: string;
  readonly userId: string;
  readonly questionId: string;
  readonly practiceSessionId: string | null;
  readonly selectedChoiceId: string;
  readonly isCorrect: boolean;
  readonly timeSpentSeconds: number;
  readonly answeredAt: Date;
};
