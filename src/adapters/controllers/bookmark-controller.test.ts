// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { GetBookmarksOutput } from '@/src/application/ports/bookmarks';
import {
  FakeAuthGateway,
  FakeGetBookmarksUseCase,
  FakeIdempotencyKeyRepository,
  FakeLogger,
  FakeRateLimiter,
  FakeSetBookmarkUseCase,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import type { SetBookmarkOutput } from '@/src/application/use-cases';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import type { User } from '@/src/domain/entities';
import { createSubscription, createUser } from '@/src/domain/test-helpers';
import {
  type BookmarkControllerDeps,
  getBookmarks,
  setBookmark,
} from './bookmark-controller';

type BookmarkControllerTestDeps = BookmarkControllerDeps & {
  setBookmarkUseCase: FakeSetBookmarkUseCase;
  getBookmarksUseCase: FakeGetBookmarksUseCase;
  rateLimiter: FakeRateLimiter;
  _fixtures: {
    userId: string;
  };
};

function createDeps(overrides?: {
  user?: User | null;
  isEntitled?: boolean;
  rateLimitResult?: ConstructorParameters<typeof FakeRateLimiter>[0];
  setBookmarkOutput?: SetBookmarkOutput;
  setBookmarkThrows?: unknown;
  getBookmarksOutput?: GetBookmarksOutput;
  getBookmarksThrows?: unknown;
}): BookmarkControllerTestDeps {
  const user =
    overrides?.user === undefined
      ? createUser({
          email: 'user@example.com',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        })
      : overrides.user;
  const userId = user?.id ?? crypto.randomUUID();

  const now = new Date('2026-02-01T00:00:00Z');

  const authGateway = new FakeAuthGateway(user);

  const subscriptionRepository = new FakeSubscriptionRepository(
    overrides?.isEntitled === false
      ? []
      : [
          createSubscription({
            userId,
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

  const setBookmarkUseCase = new FakeSetBookmarkUseCase(
    overrides?.setBookmarkOutput ?? { bookmarked: true },
    overrides?.setBookmarkThrows,
  );

  const getBookmarksUseCase = new FakeGetBookmarksUseCase(
    overrides?.getBookmarksOutput ?? { rows: [] },
    overrides?.getBookmarksThrows,
  );

  return {
    authGateway,
    logger: new FakeLogger(),
    rateLimiter,
    idempotencyKeyRepository: new FakeIdempotencyKeyRepository(() => now),
    checkEntitlementUseCase,
    setBookmarkUseCase,
    getBookmarksUseCase,
    now: () => now,
    _fixtures: {
      userId,
    },
  };
}

describe('bookmark-controller', () => {
  describe('setBookmark', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await setBookmark(
        { questionId: 'not-a-uuid', bookmarked: true },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { questionId: expect.any(Array) },
        },
      });
      expect(deps.setBookmarkUseCase.inputs).toEqual([]);
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await setBookmark(
        {
          questionId: '11111111-1111-1111-1111-111111111111',
          bookmarked: true,
        },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.setBookmarkUseCase.inputs).toEqual([]);
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await setBookmark(
        {
          questionId: '11111111-1111-1111-1111-111111111111',
          bookmarked: true,
        },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.setBookmarkUseCase.inputs).toEqual([]);
    });

    it('returns ok when use case succeeds', async () => {
      const deps = createDeps({ setBookmarkOutput: { bookmarked: false } });

      const result = await setBookmark(
        {
          questionId: '11111111-1111-1111-1111-111111111111',
          bookmarked: false,
        },
        deps,
      );

      expect(result).toEqual({ ok: true, data: { bookmarked: false } });
      expect(deps.setBookmarkUseCase.inputs).toEqual([
        {
          userId: deps._fixtures.userId,
          questionId: '11111111-1111-1111-1111-111111111111',
          bookmarked: false,
        },
      ]);
    });

    it('executes independently keyed set-bookmark requests separately', async () => {
      const deps = createDeps({ setBookmarkOutput: { bookmarked: false } });

      const first = await setBookmark(
        {
          questionId: '11111111-1111-1111-1111-111111111111',
          bookmarked: false,
          idempotencyKey: '22222222-2222-2222-2222-222222222222',
        },
        deps,
      );
      const second = await setBookmark(
        {
          questionId: '11111111-1111-1111-1111-111111111111',
          bookmarked: false,
          idempotencyKey: '33333333-3333-3333-3333-333333333333',
        },
        deps,
      );

      expect(first).toEqual({ ok: true, data: { bookmarked: false } });
      expect(second).toEqual(first);
      expect(deps.setBookmarkUseCase.inputs).toEqual([
        {
          userId: deps._fixtures.userId,
          questionId: '11111111-1111-1111-1111-111111111111',
          bookmarked: false,
        },
        {
          userId: deps._fixtures.userId,
          questionId: '11111111-1111-1111-1111-111111111111',
          bookmarked: false,
        },
      ]);
    });

    it('keeps successful set-bookmark requests idempotent when idempotencyKey is reused', async () => {
      const deps = createDeps({ setBookmarkOutput: { bookmarked: true } });
      const input = {
        questionId: '11111111-1111-1111-1111-111111111111',
        bookmarked: true,
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
      } as const;

      const first = await setBookmark(input, deps);
      const second = await setBookmark(input, deps);

      expect(first).toEqual({ ok: true, data: { bookmarked: true } });
      expect(second).toEqual(first);
      expect(deps.setBookmarkUseCase.inputs).toHaveLength(1);
    });

    it('replays a cached set-bookmark request while the reused key is rate limited', async () => {
      const deps = createDeps({
        setBookmarkOutput: { bookmarked: true },
        rateLimitResult: [
          {
            success: true,
            limit: 60,
            remaining: 59,
            retryAfterSeconds: 0,
          },
          {
            success: false,
            limit: 60,
            remaining: 0,
            retryAfterSeconds: 60,
          },
        ],
      });
      const input = {
        questionId: '11111111-1111-1111-1111-111111111111',
        bookmarked: true,
        idempotencyKey: '22222222-2222-2222-2222-222222222222',
      } as const;

      const first = await setBookmark(input, deps);
      const second = await setBookmark(input, deps);

      expect(first).toEqual({ ok: true, data: { bookmarked: true } });
      expect(second).toEqual(first);
      expect(deps.setBookmarkUseCase.inputs).toHaveLength(1);
      expect(deps.rateLimiter.inputs).toHaveLength(1);
    });

    it('does not cache RATE_LIMITED under the idempotency key', async () => {
      const deps = createDeps({
        rateLimitResult: [
          {
            success: false,
            limit: 60,
            remaining: 0,
            retryAfterSeconds: 60,
          },
          {
            success: true,
            limit: 60,
            remaining: 59,
            retryAfterSeconds: 0,
          },
        ],
      });
      const input = {
        questionId: '11111111-1111-1111-1111-111111111111',
        bookmarked: true,
        idempotencyKey: '22222222-2222-2222-2222-222222222222',
      } as const;

      const first = await setBookmark(input, deps);
      expect(first).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });

      const second = await setBookmark(input, deps);
      expect(second).toEqual({ ok: true, data: { bookmarked: true } });
      expect(deps.setBookmarkUseCase.inputs).toHaveLength(1);
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

      const result = await setBookmark(
        {
          questionId: '11111111-1111-1111-1111-111111111111',
          bookmarked: true,
        },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });
      expect(deps.setBookmarkUseCase.inputs).toEqual([]);
      expect(deps.rateLimiter.inputs).toEqual([
        {
          key: `bookmark:setBookmark:${deps._fixtures.userId}`,
          limit: 60,
          windowMs: 60_000,
        },
      ]);
    });

    it('returns NOT_FOUND when use case throws ApplicationError', async () => {
      const deps = createDeps({
        setBookmarkThrows: new ApplicationError(
          'NOT_FOUND',
          'Question not found',
        ),
      });

      const result = await setBookmark(
        {
          questionId: '11111111-1111-1111-1111-111111111111',
          bookmarked: true,
        },
        deps,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Question not found' },
      });
    });

    it('keeps genuine use-case ApplicationErrors cached when idempotencyKey is reused', async () => {
      const deps = createDeps({
        rateLimitResult: [
          {
            success: true,
            limit: 60,
            remaining: 59,
            retryAfterSeconds: 0,
          },
          {
            success: false,
            limit: 60,
            remaining: 0,
            retryAfterSeconds: 60,
          },
        ],
        setBookmarkThrows: new ApplicationError(
          'NOT_FOUND',
          'Question not found',
        ),
      });
      const input = {
        questionId: '11111111-1111-1111-1111-111111111111',
        bookmarked: true,
        idempotencyKey: '22222222-2222-2222-2222-222222222222',
      } as const;

      const first = await setBookmark(input, deps);
      const second = await setBookmark(input, deps);

      expect(first).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Question not found' },
      });
      expect(second).toEqual(first);
      expect(deps.setBookmarkUseCase.inputs).toHaveLength(1);
      expect(deps.rateLimiter.inputs).toHaveLength(1);
    });

    it('returns ok when deps are loaded from the container', async () => {
      const deps = createDeps({ setBookmarkOutput: { bookmarked: true } });

      const questionId = '11111111-1111-1111-1111-111111111111';
      const result = await setBookmark(
        { questionId, bookmarked: true },
        undefined,
        {
          loadContainer: async () => ({
            createBookmarkControllerDeps: () => deps,
          }),
        },
      );

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
      const questionId = crypto.randomUUID();
      const deps = createDeps({
        getBookmarksOutput: {
          rows: [
            {
              isAvailable: true,
              questionId,
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
      expect(deps.getBookmarksUseCase.inputs).toEqual([
        { userId: deps._fixtures.userId },
      ]);
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
