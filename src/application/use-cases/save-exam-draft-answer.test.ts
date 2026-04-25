import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createChoice,
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import {
  SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS,
  SaveExamDraftAnswerUseCase,
} from './save-exam-draft-answer';

describe('SaveExamDraftAnswerUseCase', () => {
  it('saves a draft answer for an active exam session without changing latest answer fields', async () => {
    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'exam',
      questionIds: ['q1'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: 'final-choice',
          latestIsCorrect: false,
          latestAnsweredAt: new Date('2026-03-17T11:00:00.000Z'),
        },
      ],
    });

    const sessions = new FakePracticeSessionRepository([session]);
    const questions = new FakeQuestionRepository([
      createQuestion({
        id: 'q1',
        choices: [
          createChoice({ id: 'draft-choice', questionId: 'q1', label: 'A' }),
          createChoice({ id: 'final-choice', questionId: 'q1', label: 'B' }),
        ],
      }),
    ]);
    const useCase = new SaveExamDraftAnswerUseCase(questions, sessions);

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
        questionId: 'q1',
        selectedChoiceId: 'draft-choice',
        cumulativeMs: 45_000,
      }),
    ).resolves.toMatchObject({
      questionId: 'q1',
      latestSelectedChoiceId: 'final-choice',
      latestIsCorrect: false,
      latestAnsweredAt: new Date('2026-03-17T11:00:00.000Z'),
      draftSelectedChoiceId: 'draft-choice',
      draftCumulativeMs: 45_000,
      draftSavedAt: expect.any(Date),
    });
  });

  it('overwrites a previous draft snapshot for the same exam question', async () => {
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1'],
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: 'old-choice',
            draftSavedAt: new Date('2026-03-17T10:00:00.000Z'),
            draftCumulativeMs: 10_000,
          },
        ],
      }),
    ]);
    const questions = new FakeQuestionRepository([
      createQuestion({
        id: 'q1',
        choices: [
          createChoice({ id: 'old-choice', questionId: 'q1', label: 'A' }),
          createChoice({ id: 'new-choice', questionId: 'q1', label: 'B' }),
        ],
      }),
    ]);
    const useCase = new SaveExamDraftAnswerUseCase(questions, sessions);

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
        questionId: 'q1',
        selectedChoiceId: 'new-choice',
        cumulativeMs: 30_000,
      }),
    ).resolves.toMatchObject({
      draftSelectedChoiceId: 'new-choice',
      draftCumulativeMs: 30_000,
      draftSavedAt: expect.any(Date),
    });
  });

  it('clamps cumulativeMs at SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS when input exceeds the bound', async () => {
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1'],
      }),
    ]);
    const questions = new FakeQuestionRepository([
      createQuestion({
        id: 'q1',
        choices: [
          createChoice({ id: 'choice-1', questionId: 'q1', label: 'A' }),
          createChoice({ id: 'choice-2', questionId: 'q1', label: 'B' }),
        ],
      }),
    ]);
    const useCase = new SaveExamDraftAnswerUseCase(questions, sessions);

    await useCase.execute({
      userId: 'user-1',
      sessionId: 'session-1',
      questionId: 'q1',
      selectedChoiceId: 'choice-1',
      cumulativeMs: SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS + 1,
    });

    const persisted = await sessions.findByIdAndUserId('session-1', 'user-1');
    expect(persisted?.questionStates[0]?.draftCumulativeMs).toBe(
      SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS,
    );
  });

  it('accepts cumulativeMs values within the bound unchanged', async () => {
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1'],
      }),
    ]);
    const questions = new FakeQuestionRepository([
      createQuestion({
        id: 'q1',
        choices: [
          createChoice({ id: 'choice-1', questionId: 'q1', label: 'A' }),
          createChoice({ id: 'choice-2', questionId: 'q1', label: 'B' }),
        ],
      }),
    ]);
    const useCase = new SaveExamDraftAnswerUseCase(questions, sessions);

    await useCase.execute({
      userId: 'user-1',
      sessionId: 'session-1',
      questionId: 'q1',
      selectedChoiceId: 'choice-1',
      cumulativeMs: 5_000,
    });

    const persisted = await sessions.findByIdAndUserId('session-1', 'user-1');
    expect(persisted?.questionStates[0]?.draftCumulativeMs).toBe(5_000);
  });

  it.each([
    ['negative', -1],
    ['NaN', Number.NaN as unknown as number],
  ])('treats %s cumulativeMs as 0', async (_caseName, cumulativeMs) => {
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1'],
      }),
    ]);
    const questions = new FakeQuestionRepository([
      createQuestion({
        id: 'q1',
        choices: [
          createChoice({ id: 'choice-1', questionId: 'q1', label: 'A' }),
          createChoice({ id: 'choice-2', questionId: 'q1', label: 'B' }),
        ],
      }),
    ]);
    const useCase = new SaveExamDraftAnswerUseCase(questions, sessions);

    await useCase.execute({
      userId: 'user-1',
      sessionId: 'session-1',
      questionId: 'q1',
      selectedChoiceId: 'choice-1',
      cumulativeMs,
    });

    const persisted = await sessions.findByIdAndUserId('session-1', 'user-1');
    expect(persisted?.questionStates[0]?.draftSelectedChoiceId).toBe(
      'choice-1',
    );
    expect(persisted?.questionStates[0]?.draftCumulativeMs).toBe(0);
  });

  it('rejects tutor sessions', async () => {
    const useCase = new SaveExamDraftAnswerUseCase(
      new FakeQuestionRepository([]),
      new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'session-1',
          userId: 'user-1',
          mode: 'tutor',
          questionIds: ['q1'],
        }),
      ]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
        questionId: 'q1',
        selectedChoiceId: 'choice-1',
        cumulativeMs: 5_000,
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'Draft answers are only available in exam mode',
      ),
    );
  });

  it('rejects ended sessions', async () => {
    const useCase = new SaveExamDraftAnswerUseCase(
      new FakeQuestionRepository([]),
      new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'session-1',
          userId: 'user-1',
          mode: 'exam',
          questionIds: ['q1'],
          endedAt: new Date('2026-03-17T12:00:00.000Z'),
        }),
      ]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
        questionId: 'q1',
        selectedChoiceId: 'choice-1',
        cumulativeMs: 5_000,
      }),
    ).rejects.toEqual(
      new ApplicationError('CONFLICT', 'Cannot modify a completed session'),
    );
  });

  it('rejects missing sessions', async () => {
    const useCase = new SaveExamDraftAnswerUseCase(
      new FakeQuestionRepository([]),
      new FakePracticeSessionRepository([]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'missing-session',
        questionId: 'q1',
        selectedChoiceId: 'choice-1',
        cumulativeMs: 5_000,
      }),
    ).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Practice session not found'),
    );
  });

  it('rejects draft choices that do not belong to the question', async () => {
    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'exam',
      questionIds: ['q1'],
    });

    const questions = new FakeQuestionRepository([
      createQuestion({
        id: 'q1',
        choices: [
          createChoice({ id: 'choice-1', questionId: 'q1', label: 'A' }),
          createChoice({ id: 'choice-2', questionId: 'q1', label: 'B' }),
        ],
      }),
    ]);
    const sessions = new FakePracticeSessionRepository([session]);
    const useCase = new SaveExamDraftAnswerUseCase(questions, sessions);

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
        questionId: 'q1',
        selectedChoiceId: 'not-a-real-choice',
        cumulativeMs: 5_000,
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'Selected choice does not belong to the question',
      ),
    );
  });
});
