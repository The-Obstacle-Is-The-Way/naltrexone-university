import type { Logger } from '@/src/application/ports/logger';
import type {
  AttemptStatsReader,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { enrichWithQuestion } from '@/src/application/shared/enrich-with-question';
import {
  bindingKey,
  fetchOwnedQuestionsByBinding,
} from '@/src/application/shared/fetch-questions-by-binding';
import { computeAccuracy, computeStreak, DAY_MS } from '@/src/domain/services';
import {
  isOmittedOutcome,
  type QuestionAvailability,
  type QuestionDifficulty,
  type UnavailableQuestionAvailability,
} from '@/src/domain/value-objects';

/**
 * Dashboard "last 7 days" accuracy window.
 *
 * SSOT: docs/specs/master_spec.md § 4.5.7 (`getUserStats`).
 */
const STATS_WINDOW_DAYS = 7;

/**
 * Query window for streak computation.
 *
 * Note: This bounds the maximum streak we can compute to `STREAK_WINDOW_DAYS`
 * for performance/memory safety. Increase if/when we want longer streaks.
 */
const STREAK_WINDOW_DAYS = 60;

/**
 * Max rows shown in the "Recent activity" list on the dashboard.
 *
 * This is a UX choice to keep the page scannable without scrolling.
 */
const RECENT_ACTIVITY_LIMIT = 20;

export type GetUserStatsInput = {
  userId: string;
};

export type UserStatsOutput = {
  /** Every attempt: an activity count. */
  totalAnswered: number;
  /** Correct over scored attempts (ADR-022 Decision 3). */
  accuracyOverall: number; // 0..1
  /** Attempts that count (ADR-022 Decision 3, as amended by DEBT-494). */
  scoredOverall: number;
  /** Questions whose attempts accuracy leaves out. */
  unscoredQuestionsOverall: number;
  /** Every attempt in seven days: an activity count. */
  answeredLast7Days: number;
  accuracyLast7Days: number; // 0..1
  scoredLast7Days: number;
  unscoredQuestionsLast7Days: number;
  currentStreakDays: number; // consecutive UTC days with >=1 attempt, ending today
  recentActivity: Array<
    | {
        isAvailable: true;
        /**
         * What the learner is told about the question now (ADR-022 Decision
         * 1). One no longer published stays listed (ADR-021 §3).
         */
        availability: QuestionAvailability;
        attemptId: string;
        answeredAt: string; // ISO
        questionId: string;
        sessionId: string | null;
        sessionMode: 'tutor' | 'exam' | null;
        slug: string;
        stemMd: string;
        difficulty: QuestionDifficulty;
        isCorrect: boolean;
      }
    | {
        isAvailable: false;
        /** Shown as its label alone (ADR-022 Decision 2); null when missing. */
        availability: UnavailableQuestionAvailability | null;
        attemptId: string;
        answeredAt: string; // ISO
        questionId: string;
        sessionId: string | null;
        sessionMode: 'tutor' | 'exam' | null;
        isCorrect: boolean;
      }
  >;
};

export class GetUserStatsUseCase {
  constructor(
    private readonly attempts: AttemptStatsReader,
    private readonly questions: QuestionRepository,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: GetUserStatsInput): Promise<UserStatsOutput> {
    const now = this.now();
    const since7Days = new Date(now.getTime() - STATS_WINDOW_DAYS * DAY_MS);
    const since60Days = new Date(now.getTime() - STREAK_WINDOW_DAYS * DAY_MS);

    const [
      totalAnswered,
      scoreOverall,
      answeredLast7Days,
      scoreLast7Days,
      attemptsLast60Days,
      recentAttempts,
    ] = await Promise.all([
      this.attempts.countByUserId(input.userId),
      this.attempts.scoreByUserId(input.userId, null),
      this.attempts.countByUserIdSince(input.userId, since7Days),
      this.attempts.scoreByUserId(input.userId, since7Days),
      this.attempts.listAnsweredAtByUserIdSince(input.userId, since60Days),
      this.attempts.listRecentByUserId(input.userId, RECENT_ACTIVITY_LIMIT),
    ]);

    // ADR-022 Decision 3: accuracy counts only the scored attempts. Total
    // answered, answered in seven days and the streak count every attempt:
    // they are activity, not scores.
    const accuracyOverall = computeAccuracy(
      scoreOverall.scored,
      scoreOverall.correct,
    );
    const accuracyLast7Days = computeAccuracy(
      scoreLast7Days.scored,
      scoreLast7Days.correct,
    );
    const currentStreakDays = computeStreak(attemptsLast60Days, now);

    // ADR-021: each attempt shows the revision it graded; two attempts of one
    // question can differ. A question withdrawn since stays listed (§3), its
    // content shown only if the attempt answered it (ADR-022 Decision 2).
    const byBinding = await fetchOwnedQuestionsByBinding(
      this.questions,
      recentAttempts,
    );

    const unavailable = (
      attempt: (typeof recentAttempts)[number],
      availability: UnavailableQuestionAvailability | null = null,
    ): UserStatsOutput['recentActivity'][number] => ({
      isAvailable: false,
      availability,
      attemptId: attempt.id,
      answeredAt: attempt.answeredAt.toISOString(),
      questionId: attempt.questionId,
      sessionId: attempt.practiceSessionId,
      sessionMode: attempt.sessionMode,
      isCorrect: attempt.isCorrect,
    });

    const recentActivity = enrichWithQuestion({
      rows: recentAttempts,
      getQuestionId: (attempt) => attempt.questionId,
      questionsById: byBinding,
      getLookupKey: bindingKey,
      available: (
        attempt,
        question,
      ): UserStatsOutput['recentActivity'][number] =>
        question.availability !== 'available' &&
        isOmittedOutcome(attempt.outcome)
          ? unavailable(attempt, question.availability)
          : {
              isAvailable: true,
              availability: question.availability,
              attemptId: attempt.id,
              answeredAt: attempt.answeredAt.toISOString(),
              questionId: attempt.questionId,
              sessionId: attempt.practiceSessionId,
              sessionMode: attempt.sessionMode,
              slug: question.slug,
              stemMd: question.stemMd,
              difficulty: question.difficulty,
              isCorrect: attempt.isCorrect,
            },
      unavailable,
      logger: this.logger,
      missingQuestionMessage: 'Recent activity references missing question',
    });

    return {
      totalAnswered,
      accuracyOverall,
      scoredOverall: scoreOverall.scored,
      unscoredQuestionsOverall: scoreOverall.unscoredQuestions,
      answeredLast7Days,
      accuracyLast7Days,
      scoredLast7Days: scoreLast7Days.scored,
      unscoredQuestionsLast7Days: scoreLast7Days.unscoredQuestions,
      currentStreakDays,
      recentActivity,
    };
  }
}
