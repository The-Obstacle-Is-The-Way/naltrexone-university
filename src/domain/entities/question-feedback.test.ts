import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  NewQuestionFeedback,
  QuestionFeedback,
  QuestionRatingFeedback,
  QuestionReportFeedback,
} from './question-feedback';
import {
  newQuestionRatingFeedback,
  newQuestionReportFeedback,
} from './question-feedback';

describe('QuestionFeedback entity constructors', () => {
  const context = {
    userId: 'user-1',
    questionId: 'question-1',
    attemptId: 'attempt-1',
    practiceSessionId: 'session-1',
  } as const;

  it('creates rating feedback with report-only fields cleared', () => {
    expect(
      newQuestionRatingFeedback({
        ...context,
        rating: 'helpful',
      }),
    ).toEqual({
      ...context,
      kind: 'rating',
      rating: 'helpful',
      category: null,
      comment: null,
    });
  });

  it('creates rating retractions with null rating', () => {
    expect(
      newQuestionRatingFeedback({
        ...context,
        rating: null,
      }),
    ).toMatchObject({
      kind: 'rating',
      rating: null,
      category: null,
      comment: null,
    });
  });

  it('creates report feedback with rating cleared', () => {
    expect(
      newQuestionReportFeedback({
        ...context,
        category: 'ambiguous_wording',
        comment: 'The stem has two plausible answers.',
      }),
    ).toEqual({
      ...context,
      kind: 'report',
      rating: null,
      category: 'ambiguous_wording',
      comment: 'The stem has two plausible answers.',
    });
  });

  it('creates report feedback with a null optional comment', () => {
    expect(
      newQuestionReportFeedback({
        ...context,
        category: 'other',
        comment: null,
      }),
    ).toMatchObject({
      kind: 'report',
      rating: null,
      category: 'other',
      comment: null,
    });
  });

  it('types persisted rating and report feedback as the feedback union', () => {
    expectTypeOf<QuestionRatingFeedback>().toMatchTypeOf<QuestionFeedback>();
    expectTypeOf<QuestionReportFeedback>().toMatchTypeOf<QuestionFeedback>();
    expectTypeOf<
      ReturnType<typeof newQuestionRatingFeedback>
    >().toMatchTypeOf<NewQuestionFeedback>();
    expectTypeOf<
      ReturnType<typeof newQuestionReportFeedback>
    >().toMatchTypeOf<NewQuestionFeedback>();
  });

  it('rejects report-only fields on rating constructor input at compile time', () => {
    type RatingInput = Parameters<typeof newQuestionRatingFeedback>[0];

    const invalidRatingInput = {
      ...context,
      rating: 'helpful',
      // @ts-expect-error rating feedback cannot accept report categories.
      category: 'other',
    } satisfies RatingInput;

    expect(invalidRatingInput.category).toBe('other');
  });

  it('rejects rating-only fields on report constructor input at compile time', () => {
    type ReportInput = Parameters<typeof newQuestionReportFeedback>[0];

    const invalidReportInput = {
      ...context,
      category: 'incorrect_answer',
      comment: null,
      // @ts-expect-error report feedback cannot accept ratings.
      rating: 'not_helpful',
    } satisfies ReportInput;

    expect(invalidReportInput.rating).toBe('not_helpful');
  });
});
