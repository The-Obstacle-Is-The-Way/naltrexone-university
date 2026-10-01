import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FakeAttemptRepository,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createFinalizeQuestion,
  passthroughTransaction,
} from '@/src/application/test-helpers/finalize-exam-fixtures';
import {
  EXAM_SECONDS_PER_QUESTION,
  MS_PER_SECOND,
} from '@/src/domain/services';
import { createPracticeSession } from '@/src/domain/test-helpers';
import {
  computeFinalExamEndedAt,
  FINALIZE_FLUSH_DEADLINE_GRACE_MS,
  FinalizeExamAnswersUseCase,
} from './finalize-exam-answers';

describe('FinalizeExamAnswersUseCase', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('exam end timestamp cap (BUG-255)', () => {
    const STARTED_AT = new Date('2026-03-17T12:00:00.000Z');
    const ONE_QUESTION_DEADLINE = new Date(
      STARTED_AT.getTime() + EXAM_SECONDS_PER_QUESTION * MS_PER_SECOND,
    );

    function createTimedExamUseCase(input: { now: Date }) {
      const questions = new FakeQuestionRepository([
        createFinalizeQuestion('q1', 'q1-correct', 'q1-wrong'),
      ]);
      const attempts = new FakeAttemptRepository();
      const sessions = new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'session-1',
          userId: 'user-1',
          mode: 'exam',
          questionIds: ['q1'],
          startedAt: STARTED_AT,
          questionStates: [
            {
              questionId: 'q1',
              markedForReview: false,
              latestSelectedChoiceId: null,
              latestIsCorrect: null,
              latestAnsweredAt: null,
              draftSelectedChoiceId: 'q1-correct',
              draftSavedAt: new Date(STARTED_AT.getTime() + 30_000),
              draftCumulativeMs: 30_000,
            },
          ],
        }),
      ]);
      const useCase = new FinalizeExamAnswersUseCase(
        questions,
        attempts,
        sessions,
        passthroughTransaction(questions, attempts, sessions),
        () => input.now,
      );

      return { attempts, sessions, useCase };
    }

    it('caps late exam finalization endedAt and duration at the server deadline', async () => {
      const { attempts, sessions, useCase } = createTimedExamUseCase({
        now: new Date('2026-03-17T12:05:00.000Z'),
      });

      const summary = await useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      });

      expect(summary).toMatchObject({
        endedAt: ONE_QUESTION_DEADLINE.toISOString(),
        totals: {
          durationSeconds: EXAM_SECONDS_PER_QUESTION,
        },
      });
      await expect(
        sessions.findByIdAndUserId('session-1', 'user-1'),
      ).resolves.toMatchObject({
        endedAt: ONE_QUESTION_DEADLINE,
      });
      await expect(
        attempts.findBySessionId('session-1', 'user-1'),
      ).resolves.toMatchObject([{ answeredAt: ONE_QUESTION_DEADLINE }]);
    });

    it('keeps early exam finalization endedAt at now', async () => {
      const earlyNow = new Date(STARTED_AT.getTime() + 30_000);
      const { sessions, useCase } = createTimedExamUseCase({ now: earlyNow });

      const summary = await useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      });

      expect(summary).toMatchObject({
        endedAt: earlyNow.toISOString(),
        totals: {
          durationSeconds: 30,
        },
      });
      await expect(
        sessions.findByIdAndUserId('session-1', 'user-1'),
      ).resolves.toMatchObject({ endedAt: earlyNow });
    });

    // After the deadline, the exam ends at its latest answer, whichever item
    // holds it.
    it('ends a late exam at its latest answer, whichever item holds it', async () => {
      const deadline = new Date(
        STARTED_AT.getTime() + 2 * EXAM_SECONDS_PER_QUESTION * MS_PER_SECOND,
      );
      const answeredAt = (questionId: string, at: Date) => ({
        questionId,
        markedForReview: false,
        latestSelectedChoiceId: `${questionId}-correct`,
        latestIsCorrect: true,
        latestAnsweredAt: at,
        draftSelectedChoiceId: null,
        draftSavedAt: null,
        draftCumulativeMs: 0,
      });
      const questions = new FakeQuestionRepository([
        createFinalizeQuestion('q1', 'q1-correct'),
        createFinalizeQuestion('q2', 'q2-correct'),
      ]);
      const attempts = new FakeAttemptRepository();
      const sessions = new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'session-1',
          userId: 'user-1',
          mode: 'exam',
          questionIds: ['q1', 'q2'],
          startedAt: STARTED_AT,
          questionStates: [
            answeredAt('q1', new Date(deadline.getTime() + 5_000)),
            answeredAt('q2', new Date(deadline.getTime() - 60_000)),
          ],
        }),
      ]);
      const useCase = new FinalizeExamAnswersUseCase(
        questions,
        attempts,
        sessions,
        passthroughTransaction(questions, attempts, sessions),
        () => new Date(deadline.getTime() + 30_000),
      );

      await expect(
        useCase.execute({ userId: 'user-1', sessionId: 'session-1' }),
      ).resolves.toMatchObject({
        endedAt: new Date(deadline.getTime() + 5_000).toISOString(),
      });
    });

    it('uses now when the exam deadline is unavailable', () => {
      const now = new Date('2026-03-17T12:05:00.000Z');

      expect(
        computeFinalExamEndedAt({
          now,
          deadline: null,
          latestAnsweredAtMs: Number.NEGATIVE_INFINITY,
        }),
      ).toEqual(now);
    });

    it('does not cap below a BUG-254 grace-window attempt answered after the deadline', async () => {
      vi.useFakeTimers();
      const graceAnsweredAt = new Date(
        ONE_QUESTION_DEADLINE.getTime() + FINALIZE_FLUSH_DEADLINE_GRACE_MS,
      );
      vi.setSystemTime(graceAnsweredAt);
      const { attempts, sessions, useCase } = createTimedExamUseCase({
        now: graceAnsweredAt,
      });

      const summary = await useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
        finalDraftAnswer: {
          questionId: 'q1',
          selectedChoiceId: 'q1-correct',
          cumulativeMs: 30_000,
        },
      });
      const [attempt] = await attempts.findBySessionId('session-1', 'user-1');

      expect(attempt?.answeredAt).toEqual(graceAnsweredAt);
      expect(summary.endedAt).toBe(graceAnsweredAt.toISOString());
      await expect(
        sessions.findByIdAndUserId('session-1', 'user-1'),
      ).resolves.toMatchObject({ endedAt: graceAnsweredAt });
    });
  });
});
