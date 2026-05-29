import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { toAttemptDomain } from './attempt-row-mappers';

const attemptId = crypto.randomUUID();
const userId = crypto.randomUUID();
const questionId = crypto.randomUUID();
const selectedChoiceId = crypto.randomUUID();

const baseRow = {
  id: attemptId,
  userId,
  questionId,
  practiceSessionId: null,
  selectedChoiceId,
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
    ).toThrow(`Attempt ${attemptId} cannot be omitted with a selected choice`);
  });

  it('rejects answered rows without a selected choice', () => {
    expect(() =>
      toAttemptDomain({
        ...baseRow,
        selectedChoiceId: null,
        isOmitted: false,
      }),
    ).toThrow(`Attempt ${attemptId} selectedChoiceId must not be null`);
  });

  it('rejects omitted rows marked correct', () => {
    expect(() =>
      toAttemptDomain({
        ...baseRow,
        selectedChoiceId: null,
        isOmitted: true,
      }),
    ).toThrow(`Attempt ${attemptId} cannot be omitted and correct`);
  });
});
