import { describe, expect, it } from 'vitest';
import {
  createChoice,
  createPracticeSession,
  createQuestion,
  createTag,
} from '@/src/domain/test-helpers';
import { ApplicationError } from '../errors';
import {
  FakeAttemptRepository,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '../test-helpers/fakes';
import { GetNextQuestionUseCase } from './get-next-question';

describe('GetNextQuestionUseCase', () => {
  it('returns next unanswered question for a session', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';

    const q1 = createQuestion({
      id: 'q1',
      status: 'published',
      choices: [createChoice({ id: 'c1', questionId: 'q1', label: 'A' })],
    });
    const q2 = createQuestion({
      id: 'q2',
      status: 'published',
      choices: [createChoice({ id: 'c2', questionId: 'q2', label: 'A' })],
    });

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'tutor',
      questionIds: ['q1', 'q2'],
    });

    const questions = new FakeQuestionRepository([q1, q2]);
    const attempts = new FakeAttemptRepository([
      {
        id: 'attempt-1',
        userId,
        questionId: 'q1',
        practiceSessionId: sessionId,
        selectedChoiceId: 'c1',
        isCorrect: false,
        timeSpentSeconds: 0,
        answeredAt: new Date('2026-01-31T00:00:00Z'),
      },
    ]);
    const sessions = new FakePracticeSessionRepository([session]);

    const useCase = new GetNextQuestionUseCase(questions, attempts, sessions);

    const result = await useCase.execute({ userId, sessionId });
    expect(result?.questionId).toBe('q2');
    expect(result?.session).toEqual({
      sessionId,
      mode: 'tutor',
      index: 1,
      total: 2,
    });
    expect(result?.choices[0]).not.toHaveProperty('isCorrect');
  });

  it('returns null when session is complete', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';

    const q1 = createQuestion({
      id: 'q1',
      status: 'published',
      choices: [createChoice({ id: 'c1', questionId: 'q1', label: 'A' })],
    });
    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'tutor',
      questionIds: ['q1'],
    });

    const useCase = new GetNextQuestionUseCase(
      new FakeQuestionRepository([q1]),
      new FakeAttemptRepository([
        {
          id: 'attempt-1',
          userId,
          questionId: 'q1',
          practiceSessionId: sessionId,
          selectedChoiceId: 'c1',
          isCorrect: false,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-01-31T00:00:00Z'),
        },
      ]),
      new FakePracticeSessionRepository([session]),
    );

    await expect(useCase.execute({ userId, sessionId })).resolves.toBeNull();
  });

  it('throws NOT_FOUND when session does not exist', async () => {
    const useCase = new GetNextQuestionUseCase(
      new FakeQuestionRepository([]),
      new FakeAttemptRepository([]),
      new FakePracticeSessionRepository([]),
    );

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'missing' }),
    ).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Practice session not found'),
    );
  });

  it('prefers never-attempted questions in filter mode', async () => {
    const userId = 'user-1';

    const tag = createTag({ slug: 'opioids', kind: 'topic' });

    const attempted = createQuestion({
      id: 'q-old',
      slug: 'q-old',
      status: 'published',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      choices: [createChoice({ id: 'c-old', questionId: 'q-old', label: 'A' })],
      tags: [tag],
    });

    const unattempted = createQuestion({
      id: 'q-new',
      slug: 'q-new',
      status: 'published',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      choices: [createChoice({ id: 'c-new', questionId: 'q-new', label: 'A' })],
      tags: [tag],
    });

    const questions = new FakeQuestionRepository([attempted, unattempted]);
    const attempts = new FakeAttemptRepository([
      {
        id: 'attempt-1',
        userId,
        questionId: 'q-old',
        practiceSessionId: null,
        selectedChoiceId: 'c-old',
        isCorrect: false,
        timeSpentSeconds: 0,
        answeredAt: new Date('2026-01-31T00:00:00Z'),
      },
    ]);

    const useCase = new GetNextQuestionUseCase(
      questions,
      attempts,
      new FakePracticeSessionRepository([]),
    );

    const result = await useCase.execute({
      userId,
      filters: { tagSlugs: ['opioids'], difficulties: [] },
    });

    expect(result?.questionId).toBe('q-new');
    expect(result?.session).toBeNull();
  });

  it('chooses the question with the oldest last attempt if all attempted', async () => {
    const userId = 'user-1';

    const q1 = createQuestion({
      id: 'q1',
      status: 'published',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      choices: [createChoice({ id: 'c1', questionId: 'q1', label: 'A' })],
    });

    const q2 = createQuestion({
      id: 'q2',
      status: 'published',
      createdAt: new Date('2026-01-02T00:00:00Z'),
      choices: [createChoice({ id: 'c2', questionId: 'q2', label: 'A' })],
    });

    const questions = new FakeQuestionRepository([q1, q2]);
    const attempts = new FakeAttemptRepository([
      {
        id: 'attempt-1',
        userId,
        questionId: 'q1',
        practiceSessionId: null,
        selectedChoiceId: 'c1',
        isCorrect: false,
        timeSpentSeconds: 0,
        answeredAt: new Date('2026-01-30T00:00:00Z'),
      },
      {
        id: 'attempt-2',
        userId,
        questionId: 'q2',
        practiceSessionId: null,
        selectedChoiceId: 'c2',
        isCorrect: false,
        timeSpentSeconds: 0,
        answeredAt: new Date('2026-01-31T00:00:00Z'),
      },
    ]);

    const useCase = new GetNextQuestionUseCase(
      questions,
      attempts,
      new FakePracticeSessionRepository([]),
    );

    const result = await useCase.execute({
      userId,
      filters: { tagSlugs: [], difficulties: [] },
    });

    expect(result?.questionId).toBe('q1');
  });
});
