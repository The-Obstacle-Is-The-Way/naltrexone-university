import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import {
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '../test-helpers/fakes';
import { GetSessionHistoryUseCase } from './get-session-history';

describe('GetSessionHistoryUseCase', () => {
  it('returns empty rows when user has no completed sessions', async () => {
    const useCase = new GetSessionHistoryUseCase(
      new FakePracticeSessionRepository([]),
      new FakeQuestionRepository([]),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toEqual({
      rows: [],
      total: 0,
      limit: 10,
      offset: 0,
    });
  });

  it('computes exam accuracy using total question count denominator', async () => {
    const startedAt = new Date('2026-02-06T10:00:00.000Z');
    const endedAt = new Date('2026-02-06T10:15:00.000Z');

    const useCase = new GetSessionHistoryUseCase(
      new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'session-1',
          userId: 'user-1',
          mode: 'exam',
          questionIds: ['q1', 'q2', 'q3'],
          questionStates: [
            {
              questionId: 'q1',
              markedForReview: false,
              latestSelectedChoiceId: 'c1',
              latestIsCorrect: true,
              latestAnsweredAt: new Date('2026-02-06T10:01:00.000Z'),
            },
            {
              questionId: 'q2',
              markedForReview: false,
              latestSelectedChoiceId: 'c2',
              latestIsCorrect: false,
              latestAnsweredAt: new Date('2026-02-06T10:02:00.000Z'),
            },
            {
              questionId: 'q3',
              markedForReview: false,
              latestSelectedChoiceId: null,
              latestIsCorrect: null,
              latestAnsweredAt: null,
            },
          ],
          startedAt,
          endedAt,
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({ id: 'q1', slug: 'q-1' }),
        createQuestion({ id: 'q2', slug: 'q-2' }),
        createQuestion({ id: 'q3', slug: 'q-3' }),
      ]),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toEqual({
      rows: [
        {
          sessionId: 'session-1',
          mode: 'exam',
          questionCount: 3,
          firstQuestionSlug: 'q-1',
          answered: 2,
          correct: 1,
          accuracy: 1 / 3,
          durationSeconds: 900,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    });
  });

  it('computes tutor accuracy using total question count denominator', async () => {
    const startedAt = new Date('2026-02-05T10:00:00.000Z');
    const endedAt = new Date('2026-02-05T10:30:00.000Z');

    const useCase = new GetSessionHistoryUseCase(
      new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'session-2',
          userId: 'user-1',
          mode: 'tutor',
          questionIds: ['q10', 'q11'],
          questionStates: [
            {
              questionId: 'q10',
              markedForReview: false,
              latestSelectedChoiceId: 'c10',
              latestIsCorrect: true,
              latestAnsweredAt: new Date('2026-02-05T10:05:00.000Z'),
            },
            {
              questionId: 'q11',
              markedForReview: false,
              latestSelectedChoiceId: null,
              latestIsCorrect: null,
              latestAnsweredAt: null,
            },
          ],
          startedAt,
          endedAt,
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({ id: 'q10', slug: 'q-10' }),
        createQuestion({ id: 'q11', slug: 'q-11' }),
      ]),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toEqual({
      rows: [
        {
          sessionId: 'session-2',
          mode: 'tutor',
          questionCount: 2,
          firstQuestionSlug: 'q-10',
          answered: 1,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 1800,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    });
  });

  it('returns accuracy 0 for tutor session with zero answered questions', async () => {
    const startedAt = new Date('2026-02-06T10:00:00.000Z');
    const endedAt = new Date('2026-02-06T10:01:00.000Z');

    const useCase = new GetSessionHistoryUseCase(
      new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'session-zero',
          userId: 'user-1',
          mode: 'tutor',
          questionIds: ['q1'],
          questionStates: [
            {
              questionId: 'q1',
              markedForReview: false,
              latestSelectedChoiceId: null,
              latestIsCorrect: null,
              latestAnsweredAt: null,
            },
          ],
          startedAt,
          endedAt,
        }),
      ]),
      new FakeQuestionRepository([createQuestion({ id: 'q1', slug: 'q-1' })]),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toEqual({
      rows: [
        {
          sessionId: 'session-zero',
          mode: 'tutor',
          questionCount: 1,
          firstQuestionSlug: 'q-1',
          answered: 0,
          correct: 0,
          accuracy: 0,
          durationSeconds: 60,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    });
  });

  it('supports filtering completed sessions by mode before pagination', async () => {
    const startedAt = new Date('2026-02-06T10:00:00.000Z');
    const endedAt = new Date('2026-02-06T10:01:00.000Z');

    const useCase = new GetSessionHistoryUseCase(
      new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'session-exam',
          userId: 'user-1',
          mode: 'exam',
          questionIds: ['q-exam'],
          questionStates: [
            {
              questionId: 'q-exam',
              markedForReview: false,
              latestSelectedChoiceId: null,
              latestIsCorrect: null,
              latestAnsweredAt: null,
            },
          ],
          startedAt,
          endedAt,
        }),
        createPracticeSession({
          id: 'session-tutor',
          userId: 'user-1',
          mode: 'tutor',
          questionIds: ['q-tutor'],
          questionStates: [
            {
              questionId: 'q-tutor',
              markedForReview: false,
              latestSelectedChoiceId: null,
              latestIsCorrect: null,
              latestAnsweredAt: null,
            },
          ],
          startedAt,
          endedAt,
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({ id: 'q-exam', slug: 'q-exam' }),
        createQuestion({ id: 'q-tutor', slug: 'q-tutor' }),
      ]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        limit: 10,
        offset: 0,
        mode: 'exam',
      }),
    ).resolves.toEqual({
      rows: [
        {
          sessionId: 'session-exam',
          mode: 'exam',
          questionCount: 1,
          firstQuestionSlug: 'q-exam',
          answered: 0,
          correct: 0,
          accuracy: 0,
          durationSeconds: 60,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    });
  });

  it('returns null firstQuestionSlug when the first session question is unavailable', async () => {
    const startedAt = new Date('2026-02-06T10:00:00.000Z');
    const endedAt = new Date('2026-02-06T10:01:00.000Z');

    const useCase = new GetSessionHistoryUseCase(
      new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'session-missing-first',
          userId: 'user-1',
          mode: 'tutor',
          questionIds: ['q-missing', 'q2'],
          questionStates: [
            {
              questionId: 'q-missing',
              markedForReview: false,
              latestSelectedChoiceId: null,
              latestIsCorrect: null,
              latestAnsweredAt: null,
            },
            {
              questionId: 'q2',
              markedForReview: false,
              latestSelectedChoiceId: null,
              latestIsCorrect: null,
              latestAnsweredAt: null,
            },
          ],
          startedAt,
          endedAt,
        }),
      ]),
      new FakeQuestionRepository([createQuestion({ id: 'q2', slug: 'q-2' })]),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toEqual({
      rows: [
        {
          sessionId: 'session-missing-first',
          mode: 'tutor',
          questionCount: 2,
          firstQuestionSlug: null,
          answered: 0,
          correct: 0,
          accuracy: 0,
          durationSeconds: 60,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    });
  });

  it('skips rows with missing endedAt even if a repository implementation returns them', async () => {
    const sessionWithMissingEnd = createPracticeSession({
      id: 'session-bad',
      userId: 'user-1',
      endedAt: null,
    });

    const sessions = new FakePracticeSessionRepository([]);
    sessions.findCompletedByUserId = async () => ({
      rows: [sessionWithMissingEnd],
      total: 1,
    });

    const useCase = new GetSessionHistoryUseCase(
      sessions,
      new FakeQuestionRepository([]),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toEqual({
      rows: [],
      total: 0,
      limit: 10,
      offset: 0,
    });
  });

  it('propagates repository failures', async () => {
    const sessions = new FakePracticeSessionRepository([]);
    sessions.findCompletedByUserId = async () => {
      throw new ApplicationError('INTERNAL_ERROR', 'Failed query');
    };

    const useCase = new GetSessionHistoryUseCase(
      sessions,
      new FakeQuestionRepository([]),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});
