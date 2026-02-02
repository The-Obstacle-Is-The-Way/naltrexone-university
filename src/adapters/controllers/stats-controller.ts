'use server';

import { z } from 'zod';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  AttemptRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';
import {
  computeAccuracy,
  computeStreak,
  filterAttemptsInWindow,
} from '@/src/domain/services';
import type { ActionResult } from './action-result';
import { err, handleError, ok } from './action-result';

const GetUserStatsInputSchema = z.object({}).strict();

const STATS_WINDOW_DAYS = 7;
const STREAK_WINDOW_DAYS = 60;
const RECENT_ACTIVITY_LIMIT = 20;

type CheckEntitlementUseCase = {
  execute: (input: CheckEntitlementInput) => Promise<CheckEntitlementOutput>;
};

export type UserStatsOutput = {
  totalAnswered: number;
  accuracyOverall: number; // 0..1
  answeredLast7Days: number;
  accuracyLast7Days: number; // 0..1
  currentStreakDays: number; // consecutive UTC days with >=1 attempt, ending today
  recentActivity: Array<{
    attemptId: string;
    answeredAt: string; // ISO
    questionId: string;
    slug: string;
    isCorrect: boolean;
  }>;
};

export type StatsControllerDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  attemptRepository: AttemptRepository;
  questionRepository: QuestionRepository;
  now: () => Date;
};

async function getDeps(
  deps?: StatsControllerDeps,
): Promise<StatsControllerDeps> {
  if (deps) return deps;

  const { createContainer } = await import('@/lib/container');
  return createContainer().createStatsControllerDeps();
}

async function requireEntitledUserId(
  deps: StatsControllerDeps,
): Promise<string | ActionResult<never>> {
  const user = await deps.authGateway.requireUser();
  const entitlement = await deps.checkEntitlementUseCase.execute({
    userId: user.id,
  });

  if (!entitlement.isEntitled) {
    return err('UNSUBSCRIBED', 'Subscription required');
  }

  return user.id;
}

export async function getUserStats(
  input: unknown,
  deps?: StatsControllerDeps,
): Promise<ActionResult<UserStatsOutput>> {
  const parsed = GetUserStatsInputSchema.safeParse(input);
  if (!parsed.success) return handleError(parsed.error);

  try {
    const d = await getDeps(deps);
    const userIdOrError = await requireEntitledUserId(d);
    if (typeof userIdOrError !== 'string') return userIdOrError;
    const userId = userIdOrError;

    const attempts = await d.attemptRepository.findByUserId(userId);
    const totalAnswered = attempts.length;
    const correctOverall = attempts.filter((a) => a.isCorrect).length;
    const accuracyOverall = computeAccuracy(totalAnswered, correctOverall);

    const now = d.now();
    const attemptsLast7Days = filterAttemptsInWindow(
      attempts,
      STATS_WINDOW_DAYS,
      now,
    );
    const answeredLast7Days = attemptsLast7Days.length;
    const correctLast7Days = attemptsLast7Days.filter(
      (a) => a.isCorrect,
    ).length;
    const accuracyLast7Days = computeAccuracy(
      answeredLast7Days,
      correctLast7Days,
    );

    const attemptsLast60Days = filterAttemptsInWindow(
      attempts,
      STREAK_WINDOW_DAYS,
      now,
    );
    const currentStreakDays = computeStreak(
      attemptsLast60Days.map((a) => a.answeredAt),
      now,
    );

    const sortedAttempts = attempts
      .slice()
      .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime());
    const recentAttempts = sortedAttempts.slice(0, RECENT_ACTIVITY_LIMIT);

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
      if (!slug) continue;

      recentActivity.push({
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
