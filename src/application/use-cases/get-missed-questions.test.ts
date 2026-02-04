import { describe, expect, it } from 'vitest';
import { createAttempt, createQuestion } from '@/src/domain/test-helpers';
import {
  FakeAttemptRepository,
  FakeLogger,
  FakeQuestionRepository,
} from '../test-helpers/fakes';
import { GetMissedQuestionsUseCase } from './get-missed-questions';

describe('GetMissedQuestionsUseCase', () => {
  it('returns empty rows when there are no missed questions', async () => {
    const useCase = new GetMissedQuestionsUseCase(
      new FakeAttemptRepository([]),
      new FakeQuestionRepository([]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toEqual({
      rows: [],
      limit: 10,
      offset: 0,
    });
  });

  it('returns missed questions joined to published questions', async () => {
    const useCase = new GetMissedQuestionsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          isCorrect: false,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
        }),
        createAttempt({
          userId: 'user-1',
          questionId: 'q2',
          isCorrect: false,
          answeredAt: new Date('2026-02-01T10:00:00Z'),
        }),
        createAttempt({
          userId: 'user-1',
          questionId: 'q3',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T09:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({ id: 'q1', slug: 'q-1', stemMd: 'Stem for q1' }),
        createQuestion({ id: 'q2', slug: 'q-2', stemMd: 'Stem for q2' }),
        createQuestion({ id: 'q3', slug: 'q-3', stemMd: 'Stem for q3' }),
      ]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toEqual({
      rows: [
        {
          isAvailable: true,
          questionId: 'q1',
          slug: 'q-1',
          stemMd: 'Stem for q1',
          difficulty: 'easy',
          lastAnsweredAt: '2026-02-01T12:00:00.000Z',
        },
        {
          isAvailable: true,
          questionId: 'q2',
          slug: 'q-2',
          stemMd: 'Stem for q2',
          difficulty: 'easy',
          lastAnsweredAt: '2026-02-01T10:00:00.000Z',
        },
      ],
      limit: 10,
      offset: 0,
    });
  });

  it('logs warning and returns unavailable row when missed question references missing question', async () => {
    const orphanedQuestionId = 'q-orphaned';
    const logger = new FakeLogger();

    const useCase = new GetMissedQuestionsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: orphanedQuestionId,
          isCorrect: false,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([]),
      logger,
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toEqual({
      rows: [
        {
          isAvailable: false,
          questionId: orphanedQuestionId,
          lastAnsweredAt: '2026-02-01T12:00:00.000Z',
        },
      ],
      limit: 10,
      offset: 0,
    });
    expect(logger.warnCalls).toEqual([
      {
        context: { questionId: orphanedQuestionId },
        msg: 'Missed question references missing question',
      },
    ]);
  });
});
