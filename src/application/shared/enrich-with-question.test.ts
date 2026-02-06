import { describe, expect, it } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createQuestion } from '@/src/domain/test-helpers';
import { enrichWithQuestion } from './enrich-with-question';

describe('enrichWithQuestion', () => {
  it('enriches rows when the question exists', () => {
    const question = createQuestion({ id: 'q-1', stemMd: 'Stem for q1' });
    const logger = new FakeLogger();

    const result = enrichWithQuestion({
      rows: [{ questionId: 'q-1', value: 1 }],
      getQuestionId: (row) => row.questionId,
      questionsById: new Map([[question.id, question]]),
      available: (row, q) => ({
        questionId: row.questionId,
        stemMd: q.stemMd as string | null,
      }),
      unavailable: (row) => ({
        questionId: row.questionId,
        stemMd: null as string | null,
      }),
      logger,
      missingQuestionMessage: 'Missing question',
    });

    expect(result).toEqual([{ questionId: 'q-1', stemMd: 'Stem for q1' }]);
    expect(logger.warnCalls).toEqual([]);
  });

  it('returns unavailable rows and logs warnings when a question is missing', () => {
    const logger = new FakeLogger();

    const result = enrichWithQuestion({
      rows: [{ questionId: 'q-missing', value: 1 }],
      getQuestionId: (row) => row.questionId,
      questionsById: new Map(),
      available: (row, q) => ({
        questionId: row.questionId,
        stemMd: q.stemMd as string | null,
      }),
      unavailable: (row) => ({
        questionId: row.questionId,
        stemMd: null as string | null,
      }),
      logger,
      missingQuestionMessage: 'Missing question',
    });

    expect(result).toEqual([{ questionId: 'q-missing', stemMd: null }]);
    expect(logger.warnCalls).toEqual([
      {
        context: { questionId: 'q-missing' },
        msg: 'Missing question',
      },
    ]);
  });
});
