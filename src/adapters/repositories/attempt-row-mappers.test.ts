import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { toAttemptDomain } from './attempt-row-mappers';

const baseRow = {
  id: 'attempt-1',
  userId: 'user-1',
  questionId: 'question-1',
  practiceSessionId: null,
  selectedChoiceId: 'choice-1',
  isCorrect: true,
  timeSpentSeconds: 12,
  answeredAt: new Date('2026-03-17T12:00:00.000Z'),
};

describe('attempt row mappers', () => {
  it('maps omitted rows to omitted outcomes', () => {
    expect(
      toAttemptDomain({
        ...baseRow,
        selectedChoiceId: null,
        isOmitted: true,
        isCorrect: false,
      }),
    ).toMatchObject({
      outcome: { kind: 'omitted' },
      isCorrect: false,
    });
  });

  it('rejects omitted rows with a selected choice', () => {
    expect(() =>
      toAttemptDomain({
        ...baseRow,
        isOmitted: true,
        isCorrect: false,
      }),
    ).toThrow(ApplicationError);
    expect(() =>
      toAttemptDomain({
        ...baseRow,
        isOmitted: true,
        isCorrect: false,
      }),
    ).toThrow('Attempt attempt-1 cannot be omitted with a selected choice');
  });

  it('rejects answered rows without a selected choice', () => {
    expect(() =>
      toAttemptDomain({
        ...baseRow,
        selectedChoiceId: null,
        isOmitted: false,
      }),
    ).toThrow('Attempt attempt-1 selectedChoiceId must not be null');
  });

  it('rejects omitted rows marked correct', () => {
    expect(() =>
      toAttemptDomain({
        ...baseRow,
        selectedChoiceId: null,
        isOmitted: true,
      }),
    ).toThrow('Attempt attempt-1 cannot be omitted and correct');
  });
});
