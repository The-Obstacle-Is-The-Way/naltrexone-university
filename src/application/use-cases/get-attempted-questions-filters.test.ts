import { describe, expect, it } from 'vitest';
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

describe('GetAttemptedQuestionsUseCase: filters', () => {
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

  it('supports difficulty filter (hard)', async () => {
    const questions = [
      createQuestion({
        id: 'q_easy',
        slug: 'q-easy',
        stemMd: 'Stem for easy',
        difficulty: 'easy',
      }),
      createQuestion({
        id: 'q_hard',
        slug: 'q-hard',
        stemMd: 'Stem for hard',
        difficulty: 'hard',
      }),
    ];

    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository(
        [
          createAttempt({
            userId: 'user-1',
            questionId: 'q_easy',
            isCorrect: true,
            answeredAt: new Date('2026-02-01T10:00:00Z'),
          }),
          createAttempt({
            userId: 'user-1',
            questionId: 'q_hard',
            isCorrect: true,
            answeredAt: new Date('2026-02-01T12:00:00Z'),
          }),
        ],
        { questions },
      ),
      new FakeQuestionRepository(questions),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        limit: 10,
        offset: 0,
        difficulty: 'hard',
      }),
    ).resolves.toMatchObject({
      rows: [{ questionId: 'q_hard', difficulty: 'hard' }],
      totalCount: 1,
    });
  });

  it('supports tagSlug filter', async () => {
    const questions = [
      createQuestion({
        id: 'q_opioids',
        slug: 'q-opioids',
        stemMd: 'Stem for opioids',
        tags: [createTag({ slug: 'opioids', name: 'Opioids' })],
      }),
      createQuestion({
        id: 'q_alcohol',
        slug: 'q-alcohol',
        stemMd: 'Stem for alcohol',
        tags: [createTag({ slug: 'alcohol', name: 'Alcohol' })],
      }),
    ];

    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository(
        [
          createAttempt({
            userId: 'user-1',
            questionId: 'q_opioids',
            isCorrect: true,
            answeredAt: new Date('2026-02-01T10:00:00Z'),
          }),
          createAttempt({
            userId: 'user-1',
            questionId: 'q_alcohol',
            isCorrect: true,
            answeredAt: new Date('2026-02-01T12:00:00Z'),
          }),
        ],
        { questions },
      ),
      new FakeQuestionRepository(questions),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        limit: 10,
        offset: 0,
        tagSlug: 'opioids',
      }),
    ).resolves.toMatchObject({
      rows: [{ questionId: 'q_opioids', tagSlugs: ['opioids'] }],
      totalCount: 1,
    });
  });

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
