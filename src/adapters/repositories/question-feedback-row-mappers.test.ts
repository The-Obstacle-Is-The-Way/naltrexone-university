import { describe, expect, it } from 'vitest';
import type { QuestionFeedback as QuestionFeedbackRow } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import { toQuestionFeedbackDomain } from './question-feedback-row-mappers';

const createdAt = new Date('2026-09-01T12:00:00.000Z');

function createRow(
  overrides: Partial<QuestionFeedbackRow>,
): QuestionFeedbackRow {
  return {
    id: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    questionId: crypto.randomUUID(),
    attemptId: crypto.randomUUID(),
    practiceSessionId: crypto.randomUUID(),
    kind: 'rating',
    rating: 'helpful',
    category: null,
    comment: null,
    idempotencyKey: crypto.randomUUID(),
    createdAt,
    ...overrides,
  };
}

const invalidRowError = expect.objectContaining({
  code: 'INTERNAL_ERROR',
  message: 'Invalid question feedback row',
});

describe('toQuestionFeedbackDomain', () => {
  it('maps a rating row to a rating without report fields', () => {
    const row = createRow({ kind: 'rating', rating: 'not_helpful' });

    expect(toQuestionFeedbackDomain(row)).toEqual({
      id: row.id,
      userId: row.userId,
      questionId: row.questionId,
      attemptId: row.attemptId,
      practiceSessionId: row.practiceSessionId,
      kind: 'rating',
      rating: 'not_helpful',
      category: null,
      comment: null,
      createdAt,
    });
  });

  it('maps a rating row without a rating as a retraction', () => {
    const row = createRow({ kind: 'rating', rating: null });

    expect(toQuestionFeedbackDomain(row)).toMatchObject({
      kind: 'rating',
      rating: null,
    });
  });

  it('maps a report row with its category and comment', () => {
    const row = createRow({
      kind: 'report',
      rating: null,
      category: 'incorrect_answer',
      comment: 'Choice B is also defensible.',
      attemptId: null,
      practiceSessionId: null,
    });

    expect(toQuestionFeedbackDomain(row)).toEqual({
      id: row.id,
      userId: row.userId,
      questionId: row.questionId,
      attemptId: null,
      practiceSessionId: null,
      kind: 'report',
      rating: null,
      category: 'incorrect_answer',
      comment: 'Choice B is also defensible.',
      createdAt,
    });
  });

  // These mirror question_feedback_kind_shape_chk: rows that the database
  // check rejects must not map to a domain entity either.
  it.each([
    ['a rating row with a category', { category: 'incorrect_answer' }],
    ['a rating row with a comment', { comment: 'Unexpected comment' }],
  ] as const)('rejects %s', (_label, overrides) => {
    const row = createRow({ kind: 'rating', ...overrides });

    expect(() => toQuestionFeedbackDomain(row)).toThrow(ApplicationError);
    expect(() => toQuestionFeedbackDomain(row)).toThrow(invalidRowError);
  });

  it.each([
    [
      'a report row with a rating',
      { rating: 'helpful', category: 'incorrect_answer' },
    ],
    ['a report row without a category', { rating: null, category: null }],
  ] as const)('rejects %s', (_label, overrides) => {
    const row = createRow({ kind: 'report', ...overrides });

    expect(() => toQuestionFeedbackDomain(row)).toThrow(ApplicationError);
    expect(() => toQuestionFeedbackDomain(row)).toThrow(invalidRowError);
  });
});
