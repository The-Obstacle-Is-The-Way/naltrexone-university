import { describe, expect, it } from 'vitest';
import type { Logger } from '@/src/adapters/shared/logger';
import type {
  BookmarkRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import {
  FakeAuthGateway,
  FakeBookmarkRepository,
  FakeQuestionRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import type { Bookmark, User } from '@/src/domain/entities';
import {
  createQuestion,
  createSubscription,
  createUser,
} from '@/src/domain/test-helpers';
import { getBookmarks, toggleBookmark } from './bookmark-controller';

class FakeLogger implements Logger {
  readonly warnCalls: Array<{ context: Record<string, unknown>; msg: string }> =
    [];

  warn(context: Record<string, unknown>, msg: string): void {
    this.warnCalls.push({ context, msg });
  }
}

function createThrowingBookmarkRepository(
  errorMessage = 'BookmarkRepository should not be called',
): BookmarkRepository {
  return {
    exists: async () => {
      throw new Error(errorMessage);
    },
    add: async () => {
      throw new Error(errorMessage);
    },
    remove: async () => {
      throw new Error(errorMessage);
    },
    listByUserId: async () => {
      throw new Error(errorMessage);
    },
  };
}

function createThrowingQuestionRepository(
  errorMessage = 'QuestionRepository should not be called',
): QuestionRepository {
  return {
    findPublishedById: async () => {
      throw new Error(errorMessage);
    },
    findPublishedBySlug: async () => {
      throw new Error(errorMessage);
    },
    findPublishedByIds: async () => {
      throw new Error(errorMessage);
    },
    listPublishedCandidateIds: async () => {
      throw new Error(errorMessage);
    },
  };
}

function createBookmark(input: {
  userId?: string;
  questionId: string;
  createdAt?: Date;
}): Bookmark {
  return {
    userId: input.userId ?? 'user_1',
    questionId: input.questionId,
    createdAt: input.createdAt ?? new Date('2026-02-01T00:00:00Z'),
  };
}

function createDeps(overrides?: {
  user?: User | null;
  isEntitled?: boolean;
  bookmarkRepository?: BookmarkRepository;
  questionRepository?: QuestionRepository;
  logger?: Logger;
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

  const defaultQuestion = createQuestion({
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'q-1',
    stemMd: 'Stem for 11111111-1111-1111-1111-111111111111',
    createdAt: now,
    updatedAt: now,
  });

  return {
    authGateway,
    checkEntitlementUseCase,
    bookmarkRepository:
      overrides?.bookmarkRepository ?? new FakeBookmarkRepository(),
    questionRepository:
      overrides?.questionRepository ??
      new FakeQuestionRepository([defaultQuestion]),
    logger: overrides?.logger,
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
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({
        isEntitled: false,
        bookmarkRepository: createThrowingBookmarkRepository(),
        questionRepository: createThrowingQuestionRepository(),
      });

      const result = await toggleBookmark(
        { questionId: '11111111-1111-1111-1111-111111111111' },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
    });

    it('returns NOT_FOUND when question does not exist', async () => {
      const deps = createDeps({
        questionRepository: new FakeQuestionRepository([]),
        bookmarkRepository: createThrowingBookmarkRepository(),
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

    it('removes the bookmark when it exists', async () => {
      const questionId = '11111111-1111-1111-1111-111111111111';
      const bookmarkRepository = new FakeBookmarkRepository([
        createBookmark({ questionId }),
      ]);

      const deps = createDeps({ bookmarkRepository });

      const result = await toggleBookmark({ questionId }, deps as never);

      expect(result).toEqual({ ok: true, data: { bookmarked: false } });
      await expect(
        bookmarkRepository.exists('user_1', questionId),
      ).resolves.toBe(false);
    });

    it('adds the bookmark when it does not exist', async () => {
      const questionId = '11111111-1111-1111-1111-111111111111';
      const bookmarkRepository = new FakeBookmarkRepository();

      const deps = createDeps({ bookmarkRepository });

      const result = await toggleBookmark({ questionId }, deps as never);

      expect(result).toEqual({ ok: true, data: { bookmarked: true } });
      await expect(
        bookmarkRepository.exists('user_1', questionId),
      ).resolves.toBe(true);
    });

    it('loads dependencies from the container when deps are omitted', async () => {
      const deps = createDeps();

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
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({
        isEntitled: false,
        bookmarkRepository: createThrowingBookmarkRepository(),
      });

      const result = await getBookmarks({}, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
    });

    it('returns bookmark rows joined to published questions', async () => {
      const bookmarks = [
        createBookmark({
          questionId: '11111111-1111-1111-1111-111111111111',
          createdAt: new Date('2026-02-01T00:00:00Z'),
        }),
        createBookmark({
          questionId: '22222222-2222-2222-2222-222222222222',
          createdAt: new Date('2026-01-31T00:00:00Z'),
        }),
      ];
      const bookmarkRepository = new FakeBookmarkRepository(bookmarks);
      const questionRepository = new FakeQuestionRepository([
        createQuestion({
          id: '11111111-1111-1111-1111-111111111111',
          slug: 'q-1',
          stemMd: 'Stem for 11111111-1111-1111-1111-111111111111',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        }),
        createQuestion({
          id: '22222222-2222-2222-2222-222222222222',
          slug: 'q-2',
          stemMd: 'Stem for 22222222-2222-2222-2222-222222222222',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        }),
      ]);

      const deps = createDeps({ bookmarkRepository, questionRepository });

      const result = await getBookmarks({}, deps as never);

      expect(result).toEqual({
        ok: true,
        data: {
          rows: [
            {
              questionId: '11111111-1111-1111-1111-111111111111',
              slug: 'q-1',
              stemMd: 'Stem for 11111111-1111-1111-1111-111111111111',
              difficulty: 'easy',
              bookmarkedAt: '2026-02-01T00:00:00.000Z',
            },
            {
              questionId: '22222222-2222-2222-2222-222222222222',
              slug: 'q-2',
              stemMd: 'Stem for 22222222-2222-2222-2222-222222222222',
              difficulty: 'easy',
              bookmarkedAt: '2026-01-31T00:00:00.000Z',
            },
          ],
        },
      });
    });

    it('returns INTERNAL_ERROR when a dependency throws', async () => {
      const bookmarkRepository: BookmarkRepository = {
        exists: async () => false,
        add: async () => {
          throw new Error('boom');
        },
        remove: async () => false,
        listByUserId: async () => {
          throw new Error('boom');
        },
      };

      const deps = createDeps({ bookmarkRepository });

      const result = await getBookmarks({}, deps as never);

      expect(result).toEqual({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
      });
    });

    it('logs warning when bookmark references missing question', async () => {
      const orphanedQuestionId = '99999999-9999-9999-9999-999999999999';
      const bookmarks = [
        createBookmark({
          questionId: orphanedQuestionId,
          createdAt: new Date('2026-02-01T00:00:00Z'),
        }),
      ];

      const logger = new FakeLogger();
      const deps = createDeps({
        bookmarkRepository: new FakeBookmarkRepository(bookmarks),
        questionRepository: new FakeQuestionRepository([]),
        logger,
      });

      const result = await getBookmarks({}, deps as never);

      expect(result).toEqual({ ok: true, data: { rows: [] } });
      expect(logger.warnCalls).toEqual([
        {
          context: { questionId: orphanedQuestionId },
          msg: 'Bookmark references missing question',
        },
      ]);
    });

    it('works without logger (optional dependency)', async () => {
      const orphanedQuestionId = '99999999-9999-9999-9999-999999999999';
      const bookmarks = [
        createBookmark({
          questionId: orphanedQuestionId,
          createdAt: new Date('2026-02-01T00:00:00Z'),
        }),
      ];

      const deps = createDeps({
        bookmarkRepository: new FakeBookmarkRepository(bookmarks),
        questionRepository: new FakeQuestionRepository([]),
      });

      const result = await getBookmarks({}, deps as never);

      expect(result).toEqual({ ok: true, data: { rows: [] } });
    });
  });
});
