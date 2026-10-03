import { describe, expect, it } from 'vitest';
import {
  FakeAttemptRepository,
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createAttempt,
  createChoice,
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import { omittedOutcome } from '@/src/domain/value-objects';
import { GetCompletedSessionQuestionsWithFeedbackUseCase } from './get-completed-session-questions-with-feedback';

// A question that changed after the session: withdrawn since (ADR-021 §3,
// ADR-022 Decision 2), or replaced by a newer revision (Pattern Registry F-12).
describe('GetCompletedSessionQuestionsWithFeedbackUseCase: content changed since', () => {
  it('keeps a withdrawn question reviewable, as answered, and marks it withdrawn (ADR-021 §3)', async () => {
    const withdrawn = createQuestion({
      id: 'q1',
      slug: 'q-1',
      status: 'archived',
      stemMd: 'Answered stem',
      choices: [
        createChoice({
          id: 'c1',
          questionId: 'q1',
          label: 'A',
          isCorrect: true,
        }),
      ],
    });
    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'exam',
      endedAt: new Date('2026-03-19T12:00:00.000Z'),
      questionIds: ['q1'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: 'c1',
          latestIsCorrect: true,
          latestAnsweredAt: new Date('2026-03-19T11:58:00.000Z'),
        },
      ],
    });
    const useCase = new GetCompletedSessionQuestionsWithFeedbackUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository([withdrawn], {
        withdrawals: [
          {
            questionId: withdrawn.id,
            questionRevisionId: withdrawn.revisionId,
          },
        ],
      }),
      new FakeAttemptRepository([]),
      new FakeLogger(),
    );

    const output = await useCase.execute({
      userId: 'user-1',
      sessionId: 'session-1',
    });

    expect(output.rows).toEqual([
      expect.objectContaining({
        isAvailable: true,
        availability: 'withdrawn',
        stemMd: 'Answered stem',
        correctChoiceId: 'c1',
      }),
    ]);
  });

  // Pattern Registry F-12: a newer revision replaced the one the session was
  // bound to. A question no longer available is not marked updated.
  it.each([
    ['published', { availability: 'available', superseded: true }],
    ['archived', { availability: 'retired', superseded: false }],
  ] as const)(
    'marks a row of a %s question whose bound revision is no longer current',
    async (status, marks) => {
      const choice = createChoice({
        id: 'c1',
        questionId: 'q1',
        isCorrect: true,
      });
      const current = createQuestion({ id: 'q1', slug: 'q-1', status });
      const bound = createQuestion({
        id: 'q1',
        revisionId: crypto.randomUUID(),
        slug: 'q-1',
        status,
        stemMd: 'Bound stem',
        choices: [choice],
      });
      const session = createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'tutor',
        endedAt: new Date('2026-03-19T12:00:00.000Z'),
        questionIds: ['q1'],
        questionStates: [
          {
            questionId: 'q1',
            questionRevisionId: bound.revisionId,
            markedForReview: false,
            latestSelectedChoiceId: 'c1',
            latestIsCorrect: true,
            latestAnsweredAt: new Date('2026-03-19T11:58:00.000Z'),
          },
        ],
      });
      const useCase = new GetCompletedSessionQuestionsWithFeedbackUseCase(
        new FakePracticeSessionRepository([session]),
        new FakeQuestionRepository([current, bound]),
        new FakeAttemptRepository([]),
        new FakeLogger(),
      );

      const output = await useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      });

      expect(output.rows).toEqual([
        expect.objectContaining({ stemMd: 'Bound stem', ...marks }),
      ]);
    },
  );

  // ADR-021 §3: the learner saw the item but never attempted it.
  it('keeps a withdrawn question the learner left unanswered unavailable, without a missing-question warning', async () => {
    const logger = new FakeLogger();
    const withdrawn = createQuestion({
      id: 'q1',
      status: 'archived',
      choices: [createChoice({ questionId: 'q1', isCorrect: true })],
    });
    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'tutor',
      endedAt: new Date('2026-03-19T12:00:00.000Z'),
      questionIds: ['q1'],
    });
    const useCase = new GetCompletedSessionQuestionsWithFeedbackUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository([withdrawn], {
        withdrawals: [
          {
            questionId: withdrawn.id,
            questionRevisionId: withdrawn.revisionId,
          },
        ],
      }),
      new FakeAttemptRepository([]),
      logger,
    );

    const output = await useCase.execute({
      userId: 'user-1',
      sessionId: 'session-1',
    });

    expect(output.rows).toEqual([
      {
        isAvailable: false,
        availability: 'withdrawn',
        questionId: 'q1',
        order: 1,
        isAnswered: false,
        isCorrect: null,
        isOmitted: false,
        markedForReview: false,
      },
    ]);
    expect(logger.warnCalls).toEqual([]);
  });

  // ADR-022 Decision 2: an exam's omitted item is not an answer, so a
  // question withdrawn since reveals nothing, though the item is attempted.
  it('keeps a withdrawn question the exam recorded as omitted unavailable', async () => {
    const withdrawn = createQuestion({
      id: 'q1',
      status: 'archived',
      choices: [createChoice({ questionId: 'q1', isCorrect: true })],
    });
    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'exam',
      endedAt: new Date('2026-03-19T12:00:00.000Z'),
      questionIds: ['q1'],
    });
    const useCase = new GetCompletedSessionQuestionsWithFeedbackUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository([withdrawn], {
        withdrawals: [
          {
            questionId: withdrawn.id,
            questionRevisionId: withdrawn.revisionId,
          },
        ],
      }),
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          practiceSessionId: 'session-1',
          outcome: omittedOutcome(),
          isCorrect: false,
        }),
      ]),
      new FakeLogger(),
    );

    const output = await useCase.execute({
      userId: 'user-1',
      sessionId: 'session-1',
    });

    expect(output.rows).toEqual([
      expect.objectContaining({
        isAvailable: false,
        questionId: 'q1',
        isAnswered: false,
        isOmitted: true,
      }),
    ]);
  });

  // ADR-022 Decision 1: each row carries its question's availability, the
  // row the learner answered and the label-only row of an omitted item alike.
  it("carries each question's availability, on answered and omitted rows", async () => {
    const held = createQuestion({
      id: 'q-held',
      status: 'archived',
      choices: [
        createChoice({ id: 'c-held', questionId: 'q-held', isCorrect: true }),
      ],
    });
    const withdrawn = createQuestion({
      id: 'q-withdrawn',
      status: 'archived',
      choices: [createChoice({ questionId: 'q-withdrawn', isCorrect: true })],
    });
    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'exam',
      endedAt: new Date('2026-03-19T12:00:00.000Z'),
      questionIds: ['q-held', 'q-withdrawn'],
    });
    const useCase = new GetCompletedSessionQuestionsWithFeedbackUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository([held, withdrawn], {
        holds: [
          {
            questionId: 'q-held',
            questionRevisionId: held.revisionId,
            lifted: false,
          },
        ],
        withdrawals: [
          {
            questionId: 'q-withdrawn',
            questionRevisionId: withdrawn.revisionId,
          },
        ],
      }),
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q-held',
          practiceSessionId: 'session-1',
          selectedChoiceId: 'c-held',
        }),
        createAttempt({
          userId: 'user-1',
          questionId: 'q-withdrawn',
          practiceSessionId: 'session-1',
          outcome: omittedOutcome(),
          isCorrect: false,
        }),
      ]),
      new FakeLogger(),
    );

    const { rows } = await useCase.execute({
      userId: 'user-1',
      sessionId: 'session-1',
    });

    expect(rows).toEqual([
      expect.objectContaining({
        isAvailable: true,
        questionId: 'q-held',
        availability: 'under_review',
      }),
      expect.objectContaining({
        isAvailable: false,
        questionId: 'q-withdrawn',
        availability: 'withdrawn',
      }),
    ]);
  });
});
