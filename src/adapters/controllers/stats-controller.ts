'use server';

import { z } from 'zod';
import {
  createDepsResolver,
  type LoadContainerFn,
  loadAppContainer,
} from '@/lib/controller-helpers';
import {
  type ActionResult,
  handleError,
  ok,
} from '@/src/adapters/controllers/action-result';
import {
  type CheckEntitlementUseCase,
  requireEntitledUserId,
} from '@/src/adapters/controllers/require-entitled-user-id';
import type { Logger } from '@/src/adapters/shared/logger';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  AttemptRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { computeAccuracy, computeStreak } from '@/src/domain/services';

const GetUserStatsInputSchema = z.object({}).strict();

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

export type StatsControllerDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  attemptRepository: AttemptRepository;
  questionRepository: QuestionRepository;
  now: () => Date;
  logger: Logger;
};

type StatsControllerContainer = {
  createStatsControllerDeps: () => StatsControllerDeps;
};

const getDeps = createDepsResolver<
  StatsControllerDeps,
  StatsControllerContainer
>((container) => container.createStatsControllerDeps(), loadAppContainer);

export async function getUserStats(
  input: unknown,
  deps?: StatsControllerDeps,
  options?: { loadContainer?: LoadContainerFn<StatsControllerContainer> },
): Promise<ActionResult<UserStatsOutput>> {
  const parsed = GetUserStatsInputSchema.safeParse(input);
  if (!parsed.success) return handleError(parsed.error);

  try {
    const d = await getDeps(deps, options);
    const userId = await requireEntitledUserId(d);

    const now = d.now();
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
      d.attemptRepository.countByUserId(userId),
      d.attemptRepository.countCorrectByUserId(userId),
      d.attemptRepository.countByUserIdSince(userId, since7Days),
      d.attemptRepository.countCorrectByUserIdSince(userId, since7Days),
      d.attemptRepository.listAnsweredAtByUserIdSince(userId, since60Days),
      d.attemptRepository.listRecentByUserId(userId, RECENT_ACTIVITY_LIMIT),
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
      await d.questionRepository.findPublishedByIds(uniqueQuestionIds);
    const slugByQuestionId = new Map(questions.map((q) => [q.id, q.slug]));

    const recentActivity: UserStatsOutput['recentActivity'] = [];
    for (const attempt of recentAttempts) {
      const slug = slugByQuestionId.get(attempt.questionId);
      if (!slug) {
        // Graceful degradation: questions can be unpublished/deleted while attempts persist.
        d.logger.warn(
          { questionId: attempt.questionId },
          'Recent activity references missing question',
        );
        recentActivity.push({
          isAvailable: false,
          attemptId: attempt.id,
          answeredAt: attempt.answeredAt.toISOString(),
          questionId: attempt.questionId,
          isCorrect: attempt.isCorrect,
        });
        continue;
      }

      recentActivity.push({
        isAvailable: true,
        attemptId: attempt.id,
        answeredAt: attempt.answeredAt.toISOString(),
        questionId: attempt.questionId,
        slug,
        isCorrect: attempt.isCorrect,
      });
    }

    return ok({
      totalAnswered,
      accuracyOverall,
      answeredLast7Days,
      accuracyLast7Days,
      currentStreakDays,
      recentActivity,
    });
  } catch (error) {
    return handleError(error);
  }
}
