import { describe, expect, it } from 'vitest';
import { getPracticeSessionTiming } from '@/src/domain/services';
import {
  createChoice,
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import {
  FakeAttemptRepository,
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '../test-helpers/fakes';
import { DiscardPracticeSessionUseCase } from './discard-practice-session';
import { GetCompletedSessionQuestionsWithFeedbackUseCase } from './get-completed-session-questions-with-feedback';
import { GetIncompletePracticeSessionUseCase } from './get-incomplete-practice-session';
import { GetPracticeSessionReviewUseCase } from './get-practice-session-review';
import { GetPracticeSessionSummaryUseCase } from './get-practice-session-summary';

function expiredExam() {
  const session = createPracticeSession({
    id: 'exam',
    userId: 'user',
    mode: 'exam',
    questionIds: ['q1'],
    startedAt: new Date('2026-05-22T12:00:00.000Z'),
    endedAt: null,
    questionStates: [
      {
        questionId: 'q1',
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: null,
        draftSelectedChoiceId: 'c1',
        draftSavedAt: new Date('2026-05-22T12:01:00.000Z'),
        draftCumulativeMs: 1_000,
      },
    ],
  });
  expect(
    getPracticeSessionTiming(session, new Date('2026-05-22T12:01:12.000Z'))
      .state,
  ).toBe('expired');
  return {
    sessions: new FakePracticeSessionRepository([session]),
    questions: new FakeQuestionRepository([
      createQuestion({
        id: 'q1',
        choices: [
          createChoice({ id: 'c1', questionId: 'q1', isCorrect: true }),
        ],
      }),
    ]),
    attempts: new FakeAttemptRepository(),
    logger: new FakeLogger(),
  };
}
const input = { userId: 'user', sessionId: 'exam' };

describe('expired unfinalized exam reads', () => {
  it('requires committed finalization before summary or completed feedback', async () => {
    const { sessions, questions, attempts, logger } = expiredExam();
    await expect(
      new GetPracticeSessionSummaryUseCase(sessions, questions).execute(input),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Practice session has not ended',
    });
    await expect(
      new GetCompletedSessionQuestionsWithFeedbackUseCase(
        sessions,
        questions,
        attempts,
        logger,
      ).execute(input),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message:
        'Practice session must be completed before feedback can be loaded',
    });
    expect(
      await sessions.findByIdAndUserId(input.sessionId, input.userId),
    ).toMatchObject({ endedAt: null });
    expect(
      await attempts.findBySessionId(input.sessionId, input.userId),
    ).toEqual([]);
  });

  it('lists the unfinished exam and its draft review without grading it', async () => {
    const { sessions, questions, attempts, logger } = expiredExam();
    await expect(
      new GetIncompletePracticeSessionUseCase(sessions).execute(input),
    ).resolves.toMatchObject({
      sessionId: 'exam',
      mode: 'exam',
      answeredCount: 1,
    });
    await expect(
      new GetPracticeSessionReviewUseCase(sessions, questions, logger).execute(
        input,
      ),
    ).resolves.toMatchObject({
      answeredCount: 1,
      rows: [{ isAnswered: true, isCorrect: null }],
    });
    expect(
      await sessions.findByIdAndUserId(input.sessionId, input.userId),
    ).toMatchObject({ endedAt: null });
    expect(
      await attempts.findBySessionId(input.sessionId, input.userId),
    ).toEqual([]);
  });

  it('discards an expired unfinalized exam without grading its saved draft', async () => {
    const { sessions, attempts } = expiredExam();
    await expect(
      new DiscardPracticeSessionUseCase(async (fn) => fn(sessions)).execute(
        input,
      ),
    ).resolves.toEqual({ discarded: true });
    expect(
      await sessions.findByIdAndUserId(input.sessionId, input.userId),
    ).toBeNull();
    expect(
      await attempts.findBySessionId(input.sessionId, input.userId),
    ).toEqual([]);
  });
});
