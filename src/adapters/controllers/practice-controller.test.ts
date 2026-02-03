import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { RateLimiter } from '@/src/application/ports/gateways';
import type {
  AttemptRepository,
  PracticeSessionRepository,
  QuestionFilters,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import {
  FakeAttemptRepository,
  FakeAuthGateway,
  FakeIdempotencyKeyRepository,
  FakeQuestionRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import type { PracticeSession, User } from '@/src/domain/entities';
import { createSeed, shuffleWithSeed } from '@/src/domain/services';
import {
  createAttempt,
  createPracticeSession,
  createSubscription,
  createUser,
} from '@/src/domain/test-helpers';
import type { PracticeControllerDeps } from './practice-controller';
import {
  endPracticeSession,
  startPracticeSession,
} from './practice-controller';

class CapturingQuestionRepository implements QuestionRepository {
  readonly listPublishedCandidateIdsInputs: QuestionFilters[] = [];

  constructor(private readonly candidateIds: readonly string[]) {}

  async findPublishedById(): Promise<null> {
    return null;
  }

  async findPublishedBySlug(): Promise<null> {
    return null;
  }

  async findPublishedByIds(): Promise<readonly []> {
    return [];
  }

  async listPublishedCandidateIds(
    filters: QuestionFilters,
  ): Promise<readonly string[]> {
    this.listPublishedCandidateIdsInputs.push(filters);
    return this.candidateIds;
  }
}

class CapturingPracticeSessionRepository implements PracticeSessionRepository {
  readonly createInputs: Array<{
    userId: string;
    mode: 'tutor' | 'exam';
    paramsJson: unknown;
  }> = [];
  readonly endInputs: Array<{ id: string; userId: string }> = [];

  constructor(
    private readonly createSessionId: string,
    private readonly endBehavior?:
      | { result: PracticeSession }
      | { throw: unknown },
  ) {}

  async findByIdAndUserId(): Promise<PracticeSession | null> {
    return null;
  }

  async create(input: {
    userId: string;
    mode: 'tutor' | 'exam';
    paramsJson: unknown;
  }): Promise<PracticeSession> {
    this.createInputs.push(input);
    return createPracticeSession({
      id: this.createSessionId,
      userId: input.userId,
      mode: input.mode,
    });
  }

  async end(id: string, userId: string): Promise<PracticeSession> {
    this.endInputs.push({ id, userId });
    if (!this.endBehavior) {
      throw new Error('end() was called unexpectedly');
    }
    if ('throw' in this.endBehavior) throw this.endBehavior.throw;
    return this.endBehavior.result;
  }
}

function createThrowingPracticeSessionRepository(
  errorMessage = 'PracticeSessionRepository should not be called',
): PracticeSessionRepository {
  return {
    findByIdAndUserId: async () => null,
    create: async () => {
      throw new Error(errorMessage);
    },
    end: async () => {
      throw new Error(errorMessage);
    },
  };
}

function createThrowingQuestionRepository(
  errorMessage = 'QuestionRepository should not be called',
): QuestionRepository {
  return {
    findPublishedById: async () => null,
    findPublishedBySlug: async () => null,
    findPublishedByIds: async () => [],
    listPublishedCandidateIds: async () => {
      throw new Error(errorMessage);
    },
  };
}

function createDeps(overrides?: {
  user?: User | null;
  isEntitled?: boolean;
  rateLimiter?: RateLimiter;
  questionRepository?: QuestionRepository;
  practiceSessionRepository?: PracticeSessionRepository;
  attemptRepository?: AttemptRepository;
  now?: () => Date;
}): PracticeControllerDeps {
  const user =
    overrides?.user === undefined
      ? createUser({
          id: 'user_1',
          email: 'user@example.com',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        })
      : overrides.user;

  const now = overrides?.now ?? (() => new Date('2026-02-01T00:00:00Z'));

  const authGateway = new FakeAuthGateway(user);

  const subscriptionRepository = new FakeSubscriptionRepository(
    overrides?.isEntitled === false
      ? []
      : [
          createSubscription({
            userId: user?.id ?? 'user_1',
            status: 'active',
            currentPeriodEnd: new Date('2026-12-31T00:00:00Z'),
          }),
        ],
  );

  const checkEntitlementUseCase = new CheckEntitlementUseCase(
    subscriptionRepository,
    now,
  );

  const rateLimiter: RateLimiter =
    overrides?.rateLimiter ??
    ({
      limit: async () => ({
        success: true,
        limit: 20,
        remaining: 19,
        retryAfterSeconds: 0,
      }),
    } satisfies RateLimiter);

  return {
    authGateway,
    rateLimiter,
    idempotencyKeyRepository: new FakeIdempotencyKeyRepository(now),
    checkEntitlementUseCase,
    questionRepository:
      overrides?.questionRepository ?? new FakeQuestionRepository([]),
    practiceSessionRepository:
      overrides?.practiceSessionRepository ??
      new CapturingPracticeSessionRepository('session_1'),
    attemptRepository:
      overrides?.attemptRepository ?? new FakeAttemptRepository(),
    now,
  };
}

describe('practice-controller', () => {
  describe('startPracticeSession', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await startPracticeSession(
        { mode: 'tutor', count: 0, tagSlugs: [], difficulties: [] },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await startPracticeSession(
        { mode: 'tutor', count: 10, tagSlugs: [], difficulties: [] },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({
        isEntitled: false,
        questionRepository: createThrowingQuestionRepository(),
        practiceSessionRepository: createThrowingPracticeSessionRepository(),
      });

      const result = await startPracticeSession(
        { mode: 'tutor', count: 10, tagSlugs: [], difficulties: [] },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
    });

    it('returns RATE_LIMITED when rate limited', async () => {
      const deps = createDeps({
        rateLimiter: {
          limit: async () => ({
            success: false,
            limit: 20,
            remaining: 0,
            retryAfterSeconds: 60,
          }),
        },
        questionRepository: createThrowingQuestionRepository(),
        practiceSessionRepository: createThrowingPracticeSessionRepository(),
      });

      const result = await startPracticeSession(
        { mode: 'tutor', count: 10, tagSlugs: [], difficulties: [] },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });
    });

    it('returns NOT_FOUND when filters yield zero questions', async () => {
      const deps = createDeps({
        questionRepository: new CapturingQuestionRepository([]),
        practiceSessionRepository: createThrowingPracticeSessionRepository(),
      });

      const result = await startPracticeSession(
        { mode: 'tutor', count: 10, tagSlugs: [], difficulties: [] },
        deps,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'No questions found' },
      });
    });

    it('creates a practice session with deterministically shuffled questions', async () => {
      const candidateIds = ['q1', 'q2', 'q3', 'q4'];
      const now = new Date('2026-02-01T00:00:00Z');
      const questionRepository = new CapturingQuestionRepository(candidateIds);
      const practiceSessionRepository = new CapturingPracticeSessionRepository(
        'session_123',
      );
      const deps = createDeps({
        questionRepository,
        practiceSessionRepository,
        now: () => now,
      });

      const input = {
        mode: 'exam',
        count: 2,
        tagSlugs: ['opioids'],
        difficulties: ['easy', 'medium'],
      };

      const seed = createSeed('user_1', now.getTime());
      const expectedQuestionIds = shuffleWithSeed(candidateIds, seed).slice(
        0,
        2,
      );

      const result = await startPracticeSession(input, deps);

      expect(result).toEqual({
        ok: true,
        data: { sessionId: 'session_123' },
      });

      expect(questionRepository.listPublishedCandidateIdsInputs).toEqual([
        {
          tagSlugs: ['opioids'],
          difficulties: ['easy', 'medium'],
        },
      ]);

      expect(practiceSessionRepository.createInputs).toEqual([
        {
          userId: 'user_1',
          mode: 'exam',
          paramsJson: {
            count: 2,
            tagSlugs: ['opioids'],
            difficulties: ['easy', 'medium'],
            questionIds: expectedQuestionIds,
          },
        },
      ]);
    });

    it('returns the cached practice session when idempotencyKey is reused', async () => {
      const candidateIds = ['q1', 'q2', 'q3'];
      const now = new Date('2026-02-01T00:00:00Z');
      const questionRepository = new CapturingQuestionRepository(candidateIds);
      const practiceSessionRepository = new CapturingPracticeSessionRepository(
        'session_123',
      );

      const deps = createDeps({
        questionRepository,
        practiceSessionRepository,
        now: () => now,
      });

      const input = {
        mode: 'tutor',
        count: 1,
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
        tagSlugs: [],
        difficulties: [],
      } as const;

      const first = await startPracticeSession(input, deps);
      const second = await startPracticeSession(input, deps);

      expect(first).toEqual({ ok: true, data: { sessionId: 'session_123' } });
      expect(second).toEqual(first);
      expect(practiceSessionRepository.createInputs).toHaveLength(1);
    });

    it('loads dependencies from the container when deps are omitted', async () => {
      const deps = createDeps({
        questionRepository: new CapturingQuestionRepository(['q1']),
        practiceSessionRepository: new CapturingPracticeSessionRepository(
          'session_123',
        ),
      });

      const result = await startPracticeSession(
        {
          mode: 'tutor',
          count: 1,
          tagSlugs: [],
          difficulties: [],
        },
        undefined,
        {
          loadContainer: async () => ({
            createPracticeControllerDeps: () => deps,
          }),
        },
      );

      expect(result).toEqual({ ok: true, data: { sessionId: 'session_123' } });
    });
  });

  describe('endPracticeSession', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await endPracticeSession({ sessionId: 'bad' }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    });

    it('returns CONFLICT when session is already ended', async () => {
      const sessionId = '11111111-1111-1111-1111-111111111111';

      const practiceSessionRepository = new CapturingPracticeSessionRepository(
        'unused',
        {
          throw: new ApplicationError(
            'CONFLICT',
            'Practice session already ended',
          ),
        },
      );

      const attemptRepository = new FakeAttemptRepository();
      attemptRepository.findBySessionId = async () => {
        throw new Error('AttemptRepository should not be called');
      };

      const deps = createDeps({
        practiceSessionRepository,
        attemptRepository,
      });

      const result = await endPracticeSession({ sessionId }, deps);

      expect(result).toEqual({
        ok: false,
        error: { code: 'CONFLICT', message: 'Practice session already ended' },
      });
    });

    it('returns INTERNAL_ERROR when endedAt is missing from the session', async () => {
      const sessionId = '11111111-1111-1111-1111-111111111111';

      const practiceSessionRepository = new CapturingPracticeSessionRepository(
        'unused',
        {
          result: createPracticeSession({
            id: sessionId,
            userId: 'user_1',
            startedAt: new Date('2026-02-01T00:00:00Z'),
            endedAt: null,
          }),
        },
      );

      const attemptRepository = new FakeAttemptRepository();
      attemptRepository.findBySessionId = async () => {
        throw new Error('AttemptRepository should not be called');
      };

      const deps = createDeps({
        practiceSessionRepository,
        attemptRepository,
      });

      const result = await endPracticeSession({ sessionId }, deps);

      expect(result).toEqual({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Practice session did not end',
        },
      });
    });

    it('ends the session and returns a summary', async () => {
      const sessionId = '11111111-1111-1111-1111-111111111111';
      const endedSession = createPracticeSession({
        id: sessionId,
        userId: 'user_1',
        startedAt: new Date('2026-02-01T00:00:00Z'),
        endedAt: new Date('2026-02-01T00:01:40Z'),
      });

      const practiceSessionRepository = new CapturingPracticeSessionRepository(
        'unused',
        { result: endedSession },
      );

      const attempts = [
        createAttempt({
          userId: 'user_1',
          practiceSessionId: sessionId,
          questionId: 'q1',
          isCorrect: true,
        }),
        createAttempt({
          userId: 'user_1',
          practiceSessionId: sessionId,
          questionId: 'q2',
          isCorrect: false,
        }),
        createAttempt({
          userId: 'user_1',
          practiceSessionId: sessionId,
          questionId: 'q3',
          isCorrect: true,
        }),
      ];
      const attemptRepository = new FakeAttemptRepository(attempts);

      const deps = createDeps({
        practiceSessionRepository,
        attemptRepository,
      });

      const result = await endPracticeSession({ sessionId }, deps);

      expect(result).toEqual({
        ok: true,
        data: {
          sessionId,
          endedAt: '2026-02-01T00:01:40.000Z',
          totals: {
            answered: 3,
            correct: 2,
            accuracy: 2 / 3,
            durationSeconds: 100,
          },
        },
      });

      expect(practiceSessionRepository.endInputs).toEqual([
        { id: sessionId, userId: 'user_1' },
      ]);
    });
  });
});
