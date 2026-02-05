// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { GetBookmarksOutput } from '@/src/application/ports/bookmarks';
import {
  FakeAuthGateway,
  FakeGetBookmarksUseCase,
  FakeRateLimiter,
  FakeSubscriptionRepository,
  FakeToggleBookmarkUseCase,
} from '@/src/application/test-helpers/fakes';
import type { ToggleBookmarkOutput } from '@/src/application/use-cases';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import type { User } from '@/src/domain/entities';
import { createSubscription, createUser } from '@/src/domain/test-helpers';
import {
  type BookmarkControllerDeps,
  getBookmarks,
  toggleBookmark,
} from './bookmark-controller';

type BookmarkControllerTestDeps = BookmarkControllerDeps & {
  toggleBookmarkUseCase: FakeToggleBookmarkUseCase;
  getBookmarksUseCase: FakeGetBookmarksUseCase;
  rateLimiter: FakeRateLimiter;
};

function createDeps(overrides?: {
  user?: User | null;
  isEntitled?: boolean;
  rateLimitResult?: ConstructorParameters<typeof FakeRateLimiter>[0];
  toggleBookmarkOutput?: ToggleBookmarkOutput;
  toggleBookmarkThrows?: unknown;
  getBookmarksOutput?: GetBookmarksOutput;
  getBookmarksThrows?: unknown;
}): BookmarkControllerTestDeps {
  const user =
    overrides?.user === undefined
      ? createUser({
          id: 'user_1',
          email: 'user@example.com',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        })
      : overrides.user;

  const now = new Date('2026-02-01T00:00:00Z');

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
    () => now,
  );

  const rateLimiter = new FakeRateLimiter(overrides?.rateLimitResult);

  const toggleBookmarkUseCase = new FakeToggleBookmarkUseCase(
    overrides?.toggleBookmarkOutput ?? { bookmarked: true },
    overrides?.toggleBookmarkThrows,
  );

  const getBookmarksUseCase = new FakeGetBookmarksUseCase(
    overrides?.getBookmarksOutput ?? { rows: [] },
    overrides?.getBookmarksThrows,
  );

  return {
    authGateway,
    rateLimiter,
    checkEntitlementUseCase,
    toggleBookmarkUseCase,
    getBookmarksUseCase,
  };
}

describe('bookmark-controller', () => {
  describe('toggleBookmark', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await toggleBookmark({ questionId: 'not-a-uuid' }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { questionId: expect.any(Array) },
        },
      });
      expect(deps.toggleBookmarkUseCase.inputs).toEqual([]);
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await toggleBookmark(
        { questionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.toggleBookmarkUseCase.inputs).toEqual([]);
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await toggleBookmark(
        { questionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.toggleBookmarkUseCase.inputs).toEqual([]);
    });

    it('returns ok when use case succeeds', async () => {
      const deps = createDeps({ toggleBookmarkOutput: { bookmarked: false } });

      const result = await toggleBookmark(
        { questionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toEqual({ ok: true, data: { bookmarked: false } });
      expect(deps.toggleBookmarkUseCase.inputs).toEqual([
        {
          userId: 'user_1',
          questionId: '11111111-1111-1111-1111-111111111111',
        },
      ]);
    });

    it('returns RATE_LIMITED when rate limiter denies request', async () => {
      const deps = createDeps({
        rateLimitResult: {
          success: false,
          limit: 60,
          remaining: 0,
          retryAfterSeconds: 30,
        },
      });

      const result = await toggleBookmark(
        { questionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });
      expect(deps.toggleBookmarkUseCase.inputs).toEqual([]);
      expect(deps.rateLimiter.inputs).toEqual([
        {
          key: 'bookmark:toggleBookmark:user_1',
          limit: 60,
          windowMs: 60_000,
        },
      ]);
    });

    it('returns NOT_FOUND when use case throws ApplicationError', async () => {
      const deps = createDeps({
        toggleBookmarkThrows: new ApplicationError(
          'NOT_FOUND',
          'Question not found',
        ),
      });

      const result = await toggleBookmark(
        { questionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Question not found' },
      });
    });

    it('returns ok when deps are loaded from the container', async () => {
      const deps = createDeps({ toggleBookmarkOutput: { bookmarked: true } });

      const questionId = '11111111-1111-1111-1111-111111111111';
      const result = await toggleBookmark({ questionId }, undefined, {
        loadContainer: async () => ({
          createBookmarkControllerDeps: () => deps,
        }),
      });

      expect(result).toEqual({ ok: true, data: { bookmarked: true } });
    });
  });

  describe('getBookmarks', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await getBookmarks({ unexpected: true }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
      expect(deps.getBookmarksUseCase.inputs).toEqual([]);
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await getBookmarks({}, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.getBookmarksUseCase.inputs).toEqual([]);
    });

    it('returns ok when use case returns bookmarks', async () => {
      const deps = createDeps({
        getBookmarksOutput: {
          rows: [
            {
              isAvailable: true,
              questionId: 'q1',
              slug: 'q-1',
              stemMd: 'Stem for q1',
              difficulty: 'easy',
              bookmarkedAt: '2026-02-01T00:00:00.000Z',
            },
          ],
        },
      });

      const result = await getBookmarks({}, deps);

      expect(result.ok).toBe(true);
      expect(deps.getBookmarksUseCase.inputs).toEqual([{ userId: 'user_1' }]);
    });

    it('returns error when use case throws ApplicationError', async () => {
      const deps = createDeps({
        getBookmarksThrows: new ApplicationError('INTERNAL_ERROR', 'boom'),
      });

      const result = await getBookmarks({}, deps);

      expect(result).toEqual({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'boom' },
      });
    });

    it('returns data when dependencies are loaded from container', async () => {
      const deps = createDeps({
        getBookmarksOutput: { rows: [] },
      });

      const result = await getBookmarks({}, undefined, {
        loadContainer: async () => ({
          createBookmarkControllerDeps: () => deps,
        }),
      });

      expect(result).toEqual({ ok: true, data: { rows: [] } });
    });
  });
});
