import { describe, expect, it } from 'vitest';
import {
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import { GetPracticeSessionReviewUseCase } from '@/src/application/use-cases/get-practice-session-review';
import {
  createChoice,
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';

// A question that changed after the session: withdrawn, held or retired since
// (ADR-021 §3, ADR-022).
describe('GetPracticeSessionReviewUseCase: content changed since', () => {
  // ADR-021 §3: a withdrawn question stays reviewable only by a learner who
  // attempted it, and only once the session is over (slice 3 covers a
  // session still in progress).
  describe('an item whose question was withdrawn since', () => {
    const withdrawn = createQuestion({
      id: 'q1',
      slug: 'q-1',
      status: 'archived',
      stemMd: 'Answered stem',
    });
    // `omitted`: an exam finalized the item unanswered, recording it as
    // omitted and incorrect with an answer time.
    function reviewOf(input: {
      ended: boolean;
      answered: boolean;
      omitted?: boolean;
    }) {
      const logger = new FakeLogger();
      const session = createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: input.omitted ? 'exam' : 'tutor',
        endedAt: input.ended ? new Date('2026-09-01T00:00:00Z') : null,
        questionIds: ['q1'],
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: input.answered ? 'c1' : null,
            latestIsCorrect: input.answered || input.omitted ? false : null,
            latestAnsweredAt:
              input.answered || input.omitted
                ? new Date('2026-08-31T00:00:00Z')
                : null,
          },
        ],
      });
      const useCase = new GetPracticeSessionReviewUseCase(
        new FakePracticeSessionRepository([session]),
        new FakeQuestionRepository([withdrawn], {
          withdrawals: [
            {
              questionId: withdrawn.id,
              questionRevisionId: withdrawn.revisionId,
            },
          ],
        }),
        logger,
      );
      return {
        logger,
        review: useCase.execute({ userId: 'user-1', sessionId: 'session-1' }),
      };
    }

    it('is available and marked withdrawn once the session ended, if the learner answered it', async () => {
      const { review } = reviewOf({ ended: true, answered: true });

      await expect(review).resolves.toMatchObject({
        rows: [
          {
            isAvailable: true,
            availability: 'withdrawn',
            slug: 'q-1',
            stemMd: 'Answered stem',
          },
        ],
      });
    });

    it.each([
      ['left unanswered in an ended session', { ended: true, answered: false }],
      ['in a session still in progress', { ended: false, answered: true }],
      // ADR-022 Decision 2: an omitted item is not an answer.
      [
        'omitted by an ended exam',
        { ended: true, answered: false, omitted: true },
      ],
    ])(
      'stays unavailable, without a missing-question warning, when %s',
      async (_name, input) => {
        const { review, logger } = reviewOf(input);

        await expect(review).resolves.toMatchObject({
          rows: [{ isAvailable: false, questionId: 'q1' }],
        });
        expect((await review).rows[0]).not.toHaveProperty('stemMd');
        expect(logger.warnCalls).toEqual([]);
      },
    );
  });

  // DEBT-498: a list shows a result no score counts as "Not scored", so each
  // row says whether the answer was graded on a key corrected since, in any
  // question state, as the score reads it.
  it.each([
    ['published', 'c1', true],
    ['published', null, false],
    ['archived', 'c1', true],
  ] as const)(
    'marks an answer graded on a corrected key, on a %s question (answer %s): %s',
    async (status, answer, answerKeyChanged) => {
      const current = createQuestion({ id: 'q1', slug: 'q-1', status });
      const bound = createQuestion({
        id: 'q1',
        revisionId: crypto.randomUUID(),
        slug: 'q-1',
        status,
        choices: [
          createChoice({ id: 'c1', questionId: 'q1', isCorrect: true }),
        ],
      });
      const session = createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'tutor',
        endedAt: new Date('2026-09-01T00:00:00Z'),
        questionIds: ['q1'],
        questionStates: [
          {
            questionId: 'q1',
            questionRevisionId: bound.revisionId,
            markedForReview: false,
            latestSelectedChoiceId: answer,
            latestIsCorrect: answer ? true : null,
            latestAnsweredAt: answer ? new Date('2026-08-31T00:00:00Z') : null,
          },
        ],
      });
      const useCase = new GetPracticeSessionReviewUseCase(
        new FakePracticeSessionRepository([session]),
        new FakeQuestionRepository([current, bound]),
        new FakeLogger(),
      );

      const { rows } = await useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      });

      expect(rows).toEqual([expect.objectContaining({ answerKeyChanged })]);
    },
  );

  // ADR-022 Decision 1: each row carries its question's availability.
  it("carries each question's availability, on answered and unanswered rows", async () => {
    const held = createQuestion({ id: 'q-held', status: 'archived' });
    const retired = createQuestion({ id: 'q-retired', status: 'archived' });
    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'tutor',
      endedAt: new Date('2026-09-01T00:00:00Z'),
      questionIds: ['q-held', 'q-retired'],
      questionStates: [
        {
          questionId: 'q-held',
          markedForReview: false,
          latestSelectedChoiceId: 'c1',
          latestIsCorrect: false,
          latestAnsweredAt: new Date('2026-08-31T00:00:00Z'),
        },
        {
          questionId: 'q-retired',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
      ],
    });
    const useCase = new GetPracticeSessionReviewUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository([held, retired], {
        holds: [
          {
            questionId: 'q-held',
            questionRevisionId: held.revisionId,
            lifted: false,
          },
        ],
      }),
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
        questionId: 'q-retired',
        availability: 'retired',
      }),
    ]);
  });

  // ADR-022 Decision 5: Review & Submit warns only about the unanswered
  // items that will be scored; one no longer available won't be.
  it('counts the scored items left unanswered in an active exam', async () => {
    const questions = ['q-open', 'q-drafted', 'q-held', 'q-withdrawn'].map(
      (id) =>
        createQuestion({
          id,
          status:
            id === 'q-open' || id === 'q-drafted' ? 'published' : 'archived',
        }),
    );
    const state = (questionId: string, drafted: boolean) => ({
      questionId,
      markedForReview: false,
      latestSelectedChoiceId: null,
      latestIsCorrect: null,
      latestAnsweredAt: null,
      draftSelectedChoiceId: drafted ? `choice-${questionId}` : null,
      draftSavedAt: drafted ? new Date('2026-08-31T00:00:00Z') : null,
      draftCumulativeMs: drafted ? 5_000 : 0,
    });
    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'exam',
      endedAt: null,
      questionIds: questions.map((question) => question.id),
      questionStates: [
        state('q-open', false),
        state('q-drafted', true),
        state('q-held', false),
        state('q-withdrawn', true),
      ],
    });
    const useCase = new GetPracticeSessionReviewUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository(questions, {
        holds: [
          {
            questionId: 'q-held',
            questionRevisionId: questions[2]?.revisionId ?? '',
            lifted: false,
          },
        ],
        withdrawals: [
          {
            questionId: 'q-withdrawn',
            questionRevisionId: questions[3]?.revisionId ?? '',
          },
        ],
      }),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'session-1' }),
    ).resolves.toMatchObject({
      totalCount: 4,
      answeredCount: 2,
      scoredUnansweredCount: 1,
    });
  });
});
