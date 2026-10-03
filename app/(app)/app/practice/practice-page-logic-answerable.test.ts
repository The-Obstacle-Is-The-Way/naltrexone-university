import { describe, expect, it } from 'vitest';
import { err, ok } from '@/src/adapters/controllers/action-result';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import { toPracticeQuestionResult } from './practice-page-logic';

// Quick practice reads by filters, which never return a session item; a
// session item here, unavailable or not, would be a broken contract (ADR-021 §3).
describe('toPracticeQuestionResult', () => {
  it('passes a question, no question, or an error through unchanged', () => {
    const question = createNextQuestion();
    const failure = err('NOT_FOUND', 'Question not found');

    expect(toPracticeQuestionResult(ok(question))).toEqual(ok(question));
    expect(toPracticeQuestionResult(ok(null))).toEqual(ok(null));
    expect(toPracticeQuestionResult(failure)).toEqual(failure);
  });

  it('reports an unavailable session item as an internal error', () => {
    const result = toPracticeQuestionResult(
      ok({
        unavailable: true as const,
        availability: 'withdrawn' as const,
        countsIfEndedNow: false,
        questionId: crypto.randomUUID(),
        session: {
          sessionId: crypto.randomUUID(),
          mode: 'tutor' as const,
          index: 0,
          total: 1,
          deadlineAt: null,
          isMarkedForReview: false,
        },
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
    });
  });
});
