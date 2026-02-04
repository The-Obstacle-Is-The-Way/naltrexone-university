import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeAuthGateway,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import type {
  GetBookmarksInput,
  GetBookmarksOutput,
  ToggleBookmarkInput,
  ToggleBookmarkOutput,
} from '@/src/application/use-cases';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import type { User } from '@/src/domain/entities';
import { createSubscription, createUser } from '@/src/domain/test-helpers';
import { getBookmarks, toggleBookmark } from './bookmark-controller';

class FakeToggleBookmarkUseCase {
  readonly inputs: ToggleBookmarkInput[] = [];

  constructor(
    private readonly output: ToggleBookmarkOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(input: ToggleBookmarkInput): Promise<ToggleBookmarkOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

class FakeGetBookmarksUseCase {
  readonly inputs: GetBookmarksInput[] = [];

  constructor(
    private readonly output: GetBookmarksOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(input: GetBookmarksInput): Promise<GetBookmarksOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

function createDeps(overrides?: {
  user?: User | null;
  isEntitled?: boolean;
  toggleBookmarkOutput?: ToggleBookmarkOutput;
  toggleBookmarkThrows?: unknown;
  getBookmarksOutput?: GetBookmarksOutput;
  getBookmarksThrows?: unknown;
}) {
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
        deps as never,
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
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.toggleBookmarkUseCase.inputs).toEqual([]);
    });

    it('returns ok result from the use case', async () => {
      const deps = createDeps({ toggleBookmarkOutput: { bookmarked: false } });

      const result = await toggleBookmark(
        { questionId: '11111111-1111-1111-1111-111111111111' },
        deps as never,
      );

      expect(result).toEqual({ ok: true, data: { bookmarked: false } });
      expect(deps.toggleBookmarkUseCase.inputs).toEqual([
        {
          userId: 'user_1',
          questionId: '11111111-1111-1111-1111-111111111111',
        },
      ]);
    });

    it('maps ApplicationError from use case via handleError', async () => {
      const deps = createDeps({
        toggleBookmarkThrows: new ApplicationError(
          'NOT_FOUND',
          'Question not found',
        ),
      });

      const result = await toggleBookmark(
        { questionId: '11111111-1111-1111-1111-111111111111' },
        deps as never,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Question not found' },
      });
    });

    it('loads dependencies from the container when deps are omitted', async () => {
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

      const result = await getBookmarks({}, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.getBookmarksUseCase.inputs).toEqual([]);
    });

    it('returns ok result from the use case', async () => {
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

      const result = await getBookmarks({}, deps as never);

      expect(result.ok).toBe(true);
      expect(deps.getBookmarksUseCase.inputs).toEqual([{ userId: 'user_1' }]);
    });

    it('maps ApplicationError from use case via handleError', async () => {
      const deps = createDeps({
        getBookmarksThrows: new ApplicationError('INTERNAL_ERROR', 'boom'),
      });

      const result = await getBookmarks({}, deps as never);

      expect(result).toEqual({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'boom' },
      });
    });

    it('loads dependencies from the container when deps are omitted', async () => {
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
