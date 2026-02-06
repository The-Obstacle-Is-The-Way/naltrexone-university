import type { Logger } from '@/src/application/ports/logger';
import { computeAccuracy, computeStreak } from '@/src/domain/services';
import type { QuestionDifficulty } from '@/src/domain/value-objects';
import type {
  AttemptStatsReader,
  QuestionRepository,
} from '../ports/repositories';
import { enrichWithQuestion } from '../shared/enrich-with-question';

const DAY_MS = 86_400_000;

/**
 * Dashboard "last 7 days" accuracy window.
 *
 * SSOT: docs/specs/spec-015-dashboard.md ("Last 7 days accuracy").
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
  totalAnswered: number;
  accuracyOverall: number; // 0..1
  answeredLast7Days: number;
  accuracyLast7Days: number; // 0..1
  currentStreakDays: number; // consecutive UTC days with >=1 attempt, ending today
  recentActivity: Array<
    | {
        isAvailable: true;
        attemptId: string;
        answeredAt: string; // ISO
        questionId: string;
        slug: string;
        stemMd: string;
        difficulty: QuestionDifficulty;
        isCorrect: boolean;
      }
    | {
        isAvailable: false;
        attemptId: string;
        answeredAt: string; // ISO
        questionId: string;
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
      correctOverall,
      answeredLast7Days,
      correctLast7Days,
      attemptsLast60Days,
      recentAttempts,
    ] = await Promise.all([
      this.attempts.countByUserId(input.userId),
      this.attempts.countCorrectByUserId(input.userId),
      this.attempts.countByUserIdSince(input.userId, since7Days),
      this.attempts.countCorrectByUserIdSince(input.userId, since7Days),
      this.attempts.listAnsweredAtByUserIdSince(input.userId, since60Days),
      this.attempts.listRecentByUserId(input.userId, RECENT_ACTIVITY_LIMIT),
    ]);

    const accuracyOverall = computeAccuracy(totalAnswered, correctOverall);
    const accuracyLast7Days = computeAccuracy(
      answeredLast7Days,
      correctLast7Days,
    );
    const currentStreakDays = computeStreak(attemptsLast60Days, now);

    const uniqueQuestionIds: string[] = [];
    const seen = new Set<string>();
    for (const attempt of recentAttempts) {
      if (seen.has(attempt.questionId)) continue;
      seen.add(attempt.questionId);
      uniqueQuestionIds.push(attempt.questionId);
    }

    const questions =
      await this.questions.findPublishedByIds(uniqueQuestionIds);
    const questionById = new Map(questions.map((q) => [q.id, q]));

    const recentActivity = enrichWithQuestion({
      rows: recentAttempts,
      getQuestionId: (attempt) => attempt.questionId,
      questionsById: questionById,
      available: (
        attempt,
        question,
      ): UserStatsOutput['recentActivity'][number] => ({
        isAvailable: true,
        attemptId: attempt.id,
        answeredAt: attempt.answeredAt.toISOString(),
        questionId: attempt.questionId,
        slug: question.slug,
        stemMd: question.stemMd,
        difficulty: question.difficulty,
        isCorrect: attempt.isCorrect,
      }),
      unavailable: (attempt): UserStatsOutput['recentActivity'][number] => ({
        isAvailable: false,
        attemptId: attempt.id,
        answeredAt: attempt.answeredAt.toISOString(),
        questionId: attempt.questionId,
        isCorrect: attempt.isCorrect,
      }),
      logger: this.logger,
      missingQuestionMessage: 'Recent activity references missing question',
    });

    return {
      totalAnswered,
      accuracyOverall,
      answeredLast7Days,
      accuracyLast7Days,
      currentStreakDays,
      recentActivity,
    };
  }
}
