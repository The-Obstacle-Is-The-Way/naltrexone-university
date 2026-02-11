import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeAttemptRepository,
  FakeLogger,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createAttempt,
  createQuestion,
  createTag,
} from '@/src/domain/test-helpers';
import { GetAttemptedQuestionsUseCase } from './get-attempted-questions';

describe('GetAttemptedQuestionsUseCase', () => {
  it('returns empty rows when user has no attempts', async () => {
    const useCase = new GetAttemptedQuestionsUseCase(
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
      totalCount: 0,
    });
  });

  it('returns all attempted questions (correct and incorrect) joined to published questions', async () => {
    const useCase = new GetAttemptedQuestionsUseCase(
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
          isCorrect: true,
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
          isCorrect: false,
          sessionId: null,
          sessionMode: null,
          slug: 'q-1',
          stemMd: 'Stem for q1',
          difficulty: 'easy',
          tagSlugs: [],
          lastAnsweredAt: '2026-02-01T12:00:00.000Z',
        },
        {
          isAvailable: true,
          questionId: 'q2',
          isCorrect: true,
          sessionId: null,
          sessionMode: null,
          slug: 'q-2',
          stemMd: 'Stem for q2',
          difficulty: 'easy',
          tagSlugs: [],
          lastAnsweredAt: '2026-02-01T10:00:00.000Z',
        },
        {
          isAvailable: true,
          questionId: 'q3',
          isCorrect: true,
          sessionId: null,
          sessionMode: null,
          slug: 'q-3',
          stemMd: 'Stem for q3',
          difficulty: 'easy',
          tagSlugs: [],
          lastAnsweredAt: '2026-02-01T09:00:00.000Z',
        },
      ],
      limit: 10,
      offset: 0,
      totalCount: 3,
    });
  });

  it('returns only the most recent attempt per question when multiple attempts exist', async () => {
    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          id: 'attempt-1',
          userId: 'user-1',
          questionId: 'q1',
          isCorrect: false,
          answeredAt: new Date('2026-02-01T10:00:00Z'),
        }),
        createAttempt({
          id: 'attempt-2',
          userId: 'user-1',
          questionId: 'q1',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({ id: 'q1', slug: 'q-1', stemMd: 'Stem for q1' }),
      ]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toMatchObject({
      rows: [
        {
          questionId: 'q1',
          isCorrect: true,
          lastAnsweredAt: '2026-02-01T12:00:00.000Z',
        },
      ],
      totalCount: 1,
    });
  });

  it('logs warning and returns unavailable row when attempted question references missing question', async () => {
    const orphanedQuestionId = 'q-orphaned';
    const logger = new FakeLogger();

    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: orphanedQuestionId,
          isCorrect: true,
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
          isCorrect: true,
          sessionId: null,
          sessionMode: null,
          lastAnsweredAt: '2026-02-01T12:00:00.000Z',
        },
      ],
      limit: 10,
      offset: 0,
      totalCount: 1,
    });
    expect(logger.warnCalls).toEqual([
      {
        context: { questionId: orphanedQuestionId },
        msg: 'Attempted question references missing question',
      },
    ]);
  });

  it('includes session context (sessionId, sessionMode) on attempted question rows when available', async () => {
    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          practiceSessionId: 'session-1',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
          sessionMode: 'exam',
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({ id: 'q1', slug: 'q-1', stemMd: 'Stem for q1' }),
      ]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toMatchObject({
      rows: [
        {
          isAvailable: true,
          questionId: 'q1',
          sessionId: 'session-1',
          sessionMode: 'exam',
        },
      ],
      totalCount: 1,
    });
  });

  it('returns empty page rows while preserving totalCount when offset is beyond available rows', async () => {
    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          isCorrect: false,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({ id: 'q1', slug: 'q-1', stemMd: 'Stem for q1' }),
      ]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 10 }),
    ).resolves.toEqual({
      rows: [],
      limit: 10,
      offset: 10,
      totalCount: 1,
    });
  });

  it('propagates repository failures', async () => {
    const attempts = new FakeAttemptRepository([]);
    attempts.countAttemptedQuestionsByUserId = async () => {
      throw new ApplicationError('INTERNAL_ERROR', 'Count failed');
    };

    const useCase = new GetAttemptedQuestionsUseCase(
      attempts,
      new FakeQuestionRepository([]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('includes tag slugs for available attempted questions', async () => {
    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({
          id: 'q1',
          slug: 'q-1',
          stemMd: 'Stem for q1',
          tags: [createTag({ slug: 'opioids', name: 'Opioids' })],
        }),
      ]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toMatchObject({
      rows: [
        {
          isAvailable: true,
          questionId: 'q1',
          slug: 'q-1',
          tagSlugs: ['opioids'],
        },
      ],
    });
  });

  const createUseCaseWithResultAttempts = () =>
    new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
        }),
        createAttempt({
          userId: 'user-1',
          questionId: 'q2',
          isCorrect: false,
          answeredAt: new Date('2026-02-01T10:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({ id: 'q1', slug: 'q-1', stemMd: 'Stem for q1' }),
        createQuestion({ id: 'q2', slug: 'q-2', stemMd: 'Stem for q2' }),
      ]),
      new FakeLogger(),
    );

  it('supports result filter (correct)', async () => {
    const useCase = createUseCaseWithResultAttempts();

    await expect(
      useCase.execute({
        userId: 'user-1',
        limit: 10,
        offset: 0,
        result: 'correct',
      }),
    ).resolves.toMatchObject({
      rows: [{ questionId: 'q1', isCorrect: true }],
      totalCount: 1,
    });
  });

  it('supports result filter (incorrect)', async () => {
    const useCase = createUseCaseWithResultAttempts();

    await expect(
      useCase.execute({
        userId: 'user-1',
        limit: 10,
        offset: 0,
        result: 'incorrect',
      }),
    ).resolves.toMatchObject({
      rows: [{ questionId: 'q2', isCorrect: false }],
      totalCount: 1,
    });
  });

  const createUseCaseWithSourceAttempts = () =>
    new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q_tutor',
          practiceSessionId: 'session-tutor',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
          sessionMode: 'tutor',
        }),
        createAttempt({
          userId: 'user-1',
          questionId: 'q_exam',
          practiceSessionId: 'session-exam',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T11:00:00Z'),
          sessionMode: 'exam',
        }),
        createAttempt({
          userId: 'user-1',
          questionId: 'q_adhoc',
          practiceSessionId: null,
          isCorrect: true,
          answeredAt: new Date('2026-02-01T10:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({
          id: 'q_tutor',
          slug: 'q-tutor',
          stemMd: 'Stem for tutor',
        }),
        createQuestion({
          id: 'q_exam',
          slug: 'q-exam',
          stemMd: 'Stem for exam',
        }),
        createQuestion({
          id: 'q_adhoc',
          slug: 'q-adhoc',
          stemMd: 'Stem for adhoc',
        }),
      ]),
      new FakeLogger(),
    );

  it('supports source filter (adhoc)', async () => {
    const useCase = createUseCaseWithSourceAttempts();

    await expect(
      useCase.execute({
        userId: 'user-1',
        limit: 10,
        offset: 0,
        source: 'adhoc',
      }),
    ).resolves.toMatchObject({
      rows: [{ questionId: 'q_adhoc', sessionId: null, sessionMode: null }],
      totalCount: 1,
    });
  });

  it('supports source filter (tutor)', async () => {
    const useCase = createUseCaseWithSourceAttempts();

    await expect(
      useCase.execute({
        userId: 'user-1',
        limit: 10,
        offset: 0,
        source: 'tutor',
      }),
    ).resolves.toMatchObject({
      rows: [
        {
          questionId: 'q_tutor',
          sessionId: 'session-tutor',
          sessionMode: 'tutor',
        },
      ],
      totalCount: 1,
    });
  });

  it('supports source filter (exam)', async () => {
    const useCase = createUseCaseWithSourceAttempts();

    await expect(
      useCase.execute({
        userId: 'user-1',
        limit: 10,
        offset: 0,
        source: 'exam',
      }),
    ).resolves.toMatchObject({
      rows: [
        {
          questionId: 'q_exam',
          sessionId: 'session-exam',
          sessionMode: 'exam',
        },
      ],
      totalCount: 1,
    });
  });

  it('supports combined result and source filters', async () => {
    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          practiceSessionId: 'session-tutor',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
          sessionMode: 'tutor',
        }),
        createAttempt({
          userId: 'user-1',
          questionId: 'q2',
          practiceSessionId: 'session-tutor-2',
          isCorrect: false,
          answeredAt: new Date('2026-02-01T11:00:00Z'),
          sessionMode: 'tutor',
        }),
        createAttempt({
          userId: 'user-1',
          questionId: 'q3',
          practiceSessionId: 'session-exam',
          isCorrect: false,
          answeredAt: new Date('2026-02-01T10:00:00Z'),
          sessionMode: 'exam',
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
      useCase.execute({
        userId: 'user-1',
        limit: 10,
        offset: 0,
        source: 'tutor',
        result: 'incorrect',
      }),
    ).resolves.toMatchObject({
      rows: [{ questionId: 'q2', isCorrect: false, sessionMode: 'tutor' }],
      totalCount: 1,
    });
  });
});
