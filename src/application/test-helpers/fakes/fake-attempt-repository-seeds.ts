// Seed builders shared by the FakeAttemptRepository suites.
import {
  type AnswerOutcome,
  answeredOutcome,
} from '@/src/domain/value-objects';
import type { FakeAttemptRepository } from './fake-attempt-repository';

export type SeedAttempt = NonNullable<
  ConstructorParameters<typeof FakeAttemptRepository>[0]
>[number];
export type VisibilitySeedAttempt = SeedAttempt;
export type VisibilitySeedAttemptOverrides = Partial<
  Omit<SeedAttempt, 'outcome'>
> & {
  outcome?: AnswerOutcome;
  selectedChoiceId?: string;
};

export const userId = 'user-1';

export function makeAttempt(
  overrides: VisibilitySeedAttemptOverrides = {},
): VisibilitySeedAttempt {
  const { selectedChoiceId, ...attemptOverrides } = overrides;

  return {
    id: 'attempt-1',
    userId,
    questionId: 'q-1',
    practiceSessionId: null,
    outcome:
      attemptOverrides.outcome ?? answeredOutcome(selectedChoiceId ?? 'c-1'),
    isCorrect: true,
    timeSpentSeconds: 0,
    retryOfAttemptId: null,
    retryOrigin: null,
    retrySessionId: null,
    answeredAt: new Date('2026-02-01T00:00:00Z'),
    ...attemptOverrides,
  };
}
