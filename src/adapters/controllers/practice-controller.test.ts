import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  AttemptRepository,
  PracticeSessionRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import type { Attempt, PracticeSession, User } from '@/src/domain/entities';
import { createSeed, shuffleWithSeed } from '@/src/domain/services';
import type { PracticeControllerDeps } from './practice-controller';
import {
  endPracticeSession,
  startPracticeSession,
} from './practice-controller';

type UserLike = User;

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
    practiceSessionId: input.practiceSessionId ?? 'session_1',
    selectedChoiceId: input.selectedChoiceId ?? 'choice_1',
    isCorrect: input.isCorrect ?? false,
    timeSpentSeconds: input.timeSpentSeconds ?? 0,
    answeredAt: input.answeredAt ?? new Date('2026-02-01T00:00:00Z'),
  };
}

function createSession(
  input: Partial<PracticeSession> & { id: string },
): PracticeSession {
  return {
    id: input.id,
    userId: input.userId ?? 'user_1',
    mode: input.mode ?? 'tutor',
    questionIds: input.questionIds ?? [],
    tagFilters: input.tagFilters ?? [],
    difficultyFilters: input.difficultyFilters ?? [],
    startedAt: input.startedAt ?? new Date('2026-02-01T00:00:00Z'),
    endedAt: input.endedAt ?? null,
  };
}

function createDeps(overrides?: {
  user?: UserLike;
  authGateway?: Partial<AuthGateway>;
  isEntitled?: boolean;
  candidateIds?: readonly string[];
  createdSessionId?: string;
  endedSession?: PracticeSession;
  attempts?: readonly Attempt[];
  now?: () => Date;
}): PracticeControllerDeps {
  const user = overrides?.user ?? createUser();
  const isEntitled = overrides?.isEntitled ?? true;
  const candidateIds = overrides?.candidateIds ?? [];
  const createdSessionId = overrides?.createdSessionId ?? 'session_1';
  const endedSession =
    overrides?.endedSession ??
    createSession({
      id: 'session_1',
      startedAt: new Date('2026-02-01T00:00:00Z'),
      endedAt: new Date('2026-02-01T00:01:40Z'),
    });
  const attempts = overrides?.attempts ?? [];
  const now = overrides?.now ?? (() => new Date('2026-02-01T00:00:00Z'));

  const authGateway: AuthGateway = {
    getCurrentUser: async () => user,
    requireUser: async () => user,
    ...overrides?.authGateway,
  };

  const checkEntitlementUseCase = {
    execute: vi.fn(async () => ({ isEntitled })),
  };

  const questionRepository: QuestionRepository = {
    findPublishedById: vi.fn(async () => null),
    findPublishedBySlug: vi.fn(async () => null),
    findPublishedByIds: vi.fn(async () => []),
    listPublishedCandidateIds: vi.fn(async () => candidateIds),
  };

  const practiceSessionRepository: PracticeSessionRepository = {
    findByIdAndUserId: vi.fn(async () => null),
    create: vi.fn(async () => createSession({ id: createdSessionId })),
    end: vi.fn(async () => endedSession),
  };

  const attemptRepository: AttemptRepository = {
    insert: vi.fn(async () => createAttempt({ questionId: 'q_1' })),
    findByUserId: vi.fn(async () => []),
    findBySessionId: vi.fn(async () => attempts),
    findMostRecentAnsweredAtByQuestionIds: vi.fn(async () => []),
  };

  return {
    authGateway,
    checkEntitlementUseCase,
    questionRepository,
    practiceSessionRepository,
    attemptRepository,
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
      const deps = createDeps({
        authGateway: {
          requireUser: async () => {
            throw new ApplicationError('UNAUTHENTICATED', 'No session');
          },
        },
      });

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
      const deps = createDeps({ isEntitled: false });

      const result = await startPracticeSession(
        { mode: 'tutor', count: 10, tagSlugs: [], difficulties: [] },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(
        deps.questionRepository.listPublishedCandidateIds,
      ).not.toHaveBeenCalled();
      expect(deps.practiceSessionRepository.create).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND when filters yield zero questions', async () => {
      const deps = createDeps({ candidateIds: [] });

      const result = await startPracticeSession(
        { mode: 'tutor', count: 10, tagSlugs: [], difficulties: [] },
        deps,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'No questions found' },
      });
      expect(deps.practiceSessionRepository.create).not.toHaveBeenCalled();
    });

    it('creates a practice session with deterministically shuffled questions', async () => {
      const candidateIds = ['q1', 'q2', 'q3', 'q4'];
      const now = new Date('2026-02-01T00:00:00Z');
      const deps = createDeps({
        candidateIds,
        createdSessionId: 'session_123',
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

      expect(
        deps.questionRepository.listPublishedCandidateIds,
      ).toHaveBeenCalledWith({
        tagSlugs: ['opioids'],
        difficulties: ['easy', 'medium'],
      });

      expect(deps.practiceSessionRepository.create).toHaveBeenCalledWith({
        userId: 'user_1',
        mode: 'exam',
        paramsJson: {
          count: 2,
          tagSlugs: ['opioids'],
          difficulties: ['easy', 'medium'],
          questionIds: expectedQuestionIds,
        },
      });
    });

    it('loads dependencies from the container when deps are omitted', async () => {
      vi.resetModules();

      const deps = createDeps({
        candidateIds: ['q1'],
        createdSessionId: 'session_123',
      });

      vi.doMock('@/lib/container', () => ({
        createContainer: () => ({
          createPracticeControllerDeps: () => deps,
        }),
      }));

      const { startPracticeSession } = await import('./practice-controller');

      const result = await startPracticeSession({
        mode: 'tutor',
        count: 1,
        tagSlugs: [],
        difficulties: [],
      });

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
      const deps = createDeps({
        endedSession: createSession({
          id: '11111111-1111-1111-1111-111111111111',
          endedAt: new Date('2026-02-01T00:00:00Z'),
        }),
        authGateway: {
          requireUser: async () => createUser(),
        },
      });

      (
        deps.practiceSessionRepository.end as unknown as ReturnType<
          typeof vi.fn
        >
      ).mockRejectedValueOnce(
        new ApplicationError('CONFLICT', 'Practice session already ended'),
      );

      const result = await endPracticeSession(
        { sessionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'CONFLICT', message: 'Practice session already ended' },
      });
    });

    it('returns INTERNAL_ERROR when endedAt is missing from the session', async () => {
      const sessionId = '11111111-1111-1111-1111-111111111111';
      const deps = createDeps({
        endedSession: createSession({
          id: sessionId,
          startedAt: new Date('2026-02-01T00:00:00Z'),
          endedAt: null,
        }),
      });

      const result = await endPracticeSession({ sessionId }, deps);

      expect(result).toEqual({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Practice session did not end',
        },
      });
      expect(deps.attemptRepository.findBySessionId).not.toHaveBeenCalled();
    });

    it('ends the session and returns a summary', async () => {
      const sessionId = '11111111-1111-1111-1111-111111111111';
      const endedSession = createSession({
        id: sessionId,
        startedAt: new Date('2026-02-01T00:00:00Z'),
        endedAt: new Date('2026-02-01T00:01:40Z'),
      });

      const attempts = [
        createAttempt({ questionId: 'q1', isCorrect: true }),
        createAttempt({ questionId: 'q2', isCorrect: false }),
        createAttempt({ questionId: 'q3', isCorrect: true }),
      ];

      const deps = createDeps({ endedSession, attempts });

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

      expect(deps.practiceSessionRepository.end).toHaveBeenCalledWith(
        sessionId,
        'user_1',
      );
      expect(deps.attemptRepository.findBySessionId).toHaveBeenCalledWith(
        sessionId,
        'user_1',
      );
    });
  });
});
