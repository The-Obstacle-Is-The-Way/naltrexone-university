import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  AttemptRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import type { Attempt, Question } from '@/src/domain/entities';
import { getUserStats } from './stats-controller';

type UserLike = {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
};

function createUser(): UserLike {
  return {
    id: 'user_1',
    email: 'user@example.com',
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
  };
}

function createAttempt(
  input: Partial<Attempt> & { questionId: string },
): Attempt {
  return {
    id: input.id ?? `attempt-${input.questionId}`,
    userId: input.userId ?? 'user_1',
    questionId: input.questionId,
    practiceSessionId: input.practiceSessionId ?? null,
    selectedChoiceId: input.selectedChoiceId ?? 'choice_1',
    isCorrect: input.isCorrect ?? false,
    timeSpentSeconds: input.timeSpentSeconds ?? 0,
    answeredAt: input.answeredAt ?? new Date('2026-02-01T00:00:00Z'),
  };
}

function createQuestion(input: Partial<Question> & { id: string }): Question {
  const now = new Date('2026-02-01T00:00:00Z');
  return {
    id: input.id,
    slug: input.slug ?? `slug-${input.id}`,
    stemMd: input.stemMd ?? `Stem for ${input.id}`,
    explanationMd: input.explanationMd ?? `Explanation for ${input.id}`,
    difficulty: input.difficulty ?? 'easy',
    status: input.status ?? 'published',
    choices: input.choices ?? [],
    tags: input.tags ?? [],
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

function createDeps(overrides?: {
  user?: UserLike;
  authGateway?: Partial<AuthGateway>;
  isEntitled?: boolean;
  attempts?: readonly Attempt[];
  questionsById?: Record<string, Question>;
  now?: () => Date;
}) {
  const user = overrides?.user ?? createUser();
  const isEntitled = overrides?.isEntitled ?? true;
  const attempts = overrides?.attempts ?? [];
  const questionsById = overrides?.questionsById ?? {};
  const now = overrides?.now ?? (() => new Date('2026-02-01T12:00:00Z'));

  const authGateway: AuthGateway = {
    getCurrentUser: async () => user as never,
    requireUser: async () => user as never,
    ...overrides?.authGateway,
  };

  const checkEntitlementUseCase = {
    execute: vi.fn(async () => ({ isEntitled })),
  };

  const attemptRepository: AttemptRepository = {
    insert: vi.fn(async () => createAttempt({ questionId: 'q_1' })),
    findByUserId: vi.fn(async () => attempts),
    findBySessionId: vi.fn(async () => []),
    findMostRecentAnsweredAtByQuestionIds: vi.fn(async () => []),
  };

  const questionRepository: QuestionRepository = {
    findPublishedById: vi.fn(async () => null),
    findPublishedBySlug: vi.fn(async () => null),
    findPublishedByIds: vi.fn(async (ids) =>
      ids.map((id) => questionsById[id]).filter((q): q is Question => !!q),
    ),
    listPublishedCandidateIds: vi.fn(async () => []),
  };

  return {
    authGateway,
    checkEntitlementUseCase,
    attemptRepository,
    questionRepository,
    now,
  };
}

describe('stats-controller', () => {
  describe('getUserStats', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await getUserStats({ extra: true }, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({
        authGateway: {
          requireUser: async () => {
            throw new ApplicationError('UNAUTHENTICATED', 'No session');
          },
        },
      });

      const result = await getUserStats({}, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await getUserStats({}, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.attemptRepository.findByUserId).not.toHaveBeenCalled();
    });

    it('computes stats from attempts and joins recent activity slugs', async () => {
      const now = new Date('2026-02-01T12:00:00Z');

      const deps = createDeps({
        now: () => now,
        attempts: [
          createAttempt({
            questionId: 'q1',
            isCorrect: true,
            answeredAt: new Date('2026-02-01T11:00:00Z'),
          }),
          createAttempt({
            questionId: 'q2',
            isCorrect: false,
            answeredAt: new Date('2026-01-31T11:00:00Z'),
          }),
          createAttempt({
            questionId: 'q3',
            isCorrect: true,
            answeredAt: new Date('2026-01-20T11:00:00Z'),
          }),
        ],
        questionsById: {
          q1: createQuestion({ id: 'q1', slug: 'q-1' }),
          q2: createQuestion({ id: 'q2', slug: 'q-2' }),
          q3: createQuestion({ id: 'q3', slug: 'q-3' }),
        },
      });

      const result = await getUserStats({}, deps as never);

      expect(result).toEqual({
        ok: true,
        data: {
          totalAnswered: 3,
          accuracyOverall: 2 / 3,
          answeredLast7Days: 2,
          accuracyLast7Days: 1 / 2,
          currentStreakDays: 2,
          recentActivity: [
            {
              answeredAt: '2026-02-01T11:00:00.000Z',
              questionId: 'q1',
              slug: 'q-1',
              isCorrect: true,
            },
            {
              answeredAt: '2026-01-31T11:00:00.000Z',
              questionId: 'q2',
              slug: 'q-2',
              isCorrect: false,
            },
            {
              answeredAt: '2026-01-20T11:00:00.000Z',
              questionId: 'q3',
              slug: 'q-3',
              isCorrect: true,
            },
          ],
        },
      });
    });
  });
});
