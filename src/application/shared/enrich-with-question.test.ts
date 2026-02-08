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

  it('returns an empty array when rows are empty', () => {
    const logger = new FakeLogger();
    const rows: Array<{ questionId: string; value: number }> = [];

    const result = enrichWithQuestion({
      rows,
      getQuestionId: (row) => row.questionId,
      questionsById: new Map(),
      available: (row, question) => ({
        questionId: row.questionId,
        stemMd: question.stemMd,
      }),
      unavailable: (row) => ({
        questionId: row.questionId,
        stemMd: null as string | null,
      }),
      logger,
      missingQuestionMessage: 'Missing question',
    });

    expect(result).toEqual([]);
    expect(logger.warnCalls).toEqual([]);
  });

  it('handles mixed found and missing questions in order', () => {
    const logger = new FakeLogger();
    const question1 = createQuestion({ id: 'q-1', stemMd: 'Stem 1' });
    const question3 = createQuestion({ id: 'q-3', stemMd: 'Stem 3' });

    const result = enrichWithQuestion({
      rows: [
        { questionId: 'q-1', rank: 1 },
        { questionId: 'q-2', rank: 2 },
        { questionId: 'q-3', rank: 3 },
      ],
      getQuestionId: (row) => row.questionId,
      questionsById: new Map([
        [question1.id, question1],
        [question3.id, question3],
      ]),
      available: (row, question) => ({
        questionId: row.questionId,
        stemMd: question.stemMd,
      }),
      unavailable: (row) => ({
        questionId: row.questionId,
        stemMd: null as string | null,
      }),
      logger,
      missingQuestionMessage: 'Missing question',
    });

    expect(result).toEqual([
      { questionId: 'q-1', stemMd: 'Stem 1' },
      { questionId: 'q-2', stemMd: null },
      { questionId: 'q-3', stemMd: 'Stem 3' },
    ]);
    expect(logger.warnCalls).toEqual([
      {
        context: { questionId: 'q-2' },
        msg: 'Missing question',
      },
    ]);
  });
});
