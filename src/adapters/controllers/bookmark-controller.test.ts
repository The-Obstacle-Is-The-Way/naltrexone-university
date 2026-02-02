import { describe, expect, it, vi } from 'vitest';
import {
  getBookmarks,
  toggleBookmark,
} from '@/src/adapters/controllers/bookmark-controller';
import type { Logger } from '@/src/adapters/shared/logger';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  BookmarkRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import type { Bookmark, Question, User } from '@/src/domain/entities';

type UserLike = User;

function createUser(): UserLike {
  return {
    id: 'user_1',
    email: 'user@example.com',
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
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

function createBookmark(
  input: Partial<Bookmark> & { questionId: string },
): Bookmark {
  return {
    userId: input.userId ?? 'user_1',
    questionId: input.questionId,
    createdAt: input.createdAt ?? new Date('2026-02-01T00:00:00Z'),
  };
}

function createDeps(overrides?: {
  user?: UserLike;
  authGateway?: Partial<AuthGateway>;
  isEntitled?: boolean;
  question?: Question | null;
  bookmarkWasRemoved?: boolean;
  bookmarks?: readonly Bookmark[];
  questionsById?: Record<string, Question>;
  logger?: Logger;
}) {
  const user = overrides?.user ?? createUser();
  const isEntitled = overrides?.isEntitled ?? true;
  const question =
    overrides?.question ??
    createQuestion({
      id: '11111111-1111-1111-1111-111111111111',
      slug: 'q-1',
    });
  const bookmarkWasRemoved = overrides?.bookmarkWasRemoved ?? false;
  const bookmarks = overrides?.bookmarks ?? [
    createBookmark({
      questionId: '11111111-1111-1111-1111-111111111111',
    }),
  ];

  const questionsById = overrides?.questionsById ?? {
    [question.id]: question,
  };

  const authGateway: AuthGateway = {
    getCurrentUser: async () => user,
    requireUser: async () => user,
    ...overrides?.authGateway,
  };

  const checkEntitlementUseCase = {
    execute: vi.fn(async () => ({ isEntitled })),
  };

  const bookmarkRepository: BookmarkRepository = {
    exists: vi.fn(async () => false),
    add: vi.fn(async () =>
      createBookmark({ questionId: '11111111-1111-1111-1111-111111111111' }),
    ),
    remove: vi.fn(async () => bookmarkWasRemoved),
    listByUserId: vi.fn(async () => bookmarks),
  };

  const questionRepository: QuestionRepository = {
    findPublishedById: vi.fn(async (id: string) => questionsById[id] ?? null),
    findPublishedBySlug: vi.fn(async () => question),
    findPublishedByIds: vi.fn(async (ids: readonly string[]) =>
      ids.map((id) => questionsById[id]).filter((q): q is Question => !!q),
    ),
    listPublishedCandidateIds: vi.fn(async () => []),
  };

  return {
    authGateway,
    checkEntitlementUseCase,
    bookmarkRepository,
    questionRepository,
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
      const deps = createDeps({
        authGateway: {
          requireUser: async () => {
            throw new ApplicationError('UNAUTHENTICATED', 'No session');
          },
        },
      });

      const result = await toggleBookmark(
        { questionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
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
      expect(deps.bookmarkRepository.exists).not.toHaveBeenCalled();
      expect(deps.bookmarkRepository.remove).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND when question does not exist', async () => {
      const deps = createDeps({ question: null, questionsById: {} });

      const result = await toggleBookmark(
        { questionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Question not found' },
      });
      expect(deps.bookmarkRepository.exists).not.toHaveBeenCalled();
      expect(deps.bookmarkRepository.remove).not.toHaveBeenCalled();
    });

    it('removes the bookmark when it exists', async () => {
      const deps = createDeps({ bookmarkWasRemoved: true });
      const questionId = '11111111-1111-1111-1111-111111111111';

      const result = await toggleBookmark({ questionId }, deps);

      expect(result).toEqual({ ok: true, data: { bookmarked: false } });
      expect(deps.bookmarkRepository.remove).toHaveBeenCalledWith(
        'user_1',
        questionId,
      );
      expect(deps.bookmarkRepository.add).not.toHaveBeenCalled();
      expect(deps.bookmarkRepository.exists).not.toHaveBeenCalled();
    });

    it('adds the bookmark when it does not exist', async () => {
      const deps = createDeps({ bookmarkWasRemoved: false });
      const questionId = '11111111-1111-1111-1111-111111111111';

      const result = await toggleBookmark({ questionId }, deps);

      expect(result).toEqual({ ok: true, data: { bookmarked: true } });
      expect(deps.bookmarkRepository.exists).not.toHaveBeenCalled();
      expect(deps.bookmarkRepository.add).toHaveBeenCalledWith(
        'user_1',
        questionId,
      );
      expect(deps.bookmarkRepository.remove).toHaveBeenCalledWith(
        'user_1',
        questionId,
      );
    });

    it('loads dependencies from the container when deps are omitted', async () => {
      vi.resetModules();

      const deps = createDeps({ bookmarkWasRemoved: false });

      vi.doMock('@/lib/container', () => ({
        createContainer: () => ({
          createBookmarkControllerDeps: () => deps,
        }),
      }));

      const { toggleBookmark } = await import('./bookmark-controller');

      const questionId = '11111111-1111-1111-1111-111111111111';
      const result = await toggleBookmark({ questionId });

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
      const deps = createDeps({ isEntitled: false });

      const result = await getBookmarks({}, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.bookmarkRepository.listByUserId).not.toHaveBeenCalled();
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

      const questionsById = {
        '11111111-1111-1111-1111-111111111111': createQuestion({
          id: '11111111-1111-1111-1111-111111111111',
          slug: 'q-1',
        }),
        '22222222-2222-2222-2222-222222222222': createQuestion({
          id: '22222222-2222-2222-2222-222222222222',
          slug: 'q-2',
        }),
      };

      const deps = createDeps({ bookmarks, questionsById });

      const result = await getBookmarks({}, deps);

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

      expect(deps.bookmarkRepository.listByUserId).toHaveBeenCalledWith(
        'user_1',
      );
      expect(deps.questionRepository.findPublishedByIds).toHaveBeenCalledWith([
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
      ]);
    });

    it('returns INTERNAL_ERROR when a dependency throws', async () => {
      const deps = createDeps();
      deps.bookmarkRepository.listByUserId = vi.fn(async () => {
        throw new Error('boom');
      });

      const result = await getBookmarks({}, deps);

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

      const logger: Logger = { warn: vi.fn() };
      const deps = createDeps({ bookmarks, questionsById: {}, logger });

      const result = await getBookmarks({}, deps);

      expect(result).toEqual({ ok: true, data: { rows: [] } });
      expect(logger.warn).toHaveBeenCalledWith(
        { questionId: orphanedQuestionId },
        'Bookmark references missing question',
      );
    });

    it('works without logger (optional dependency)', async () => {
      const orphanedQuestionId = '99999999-9999-9999-9999-999999999999';
      const bookmarks = [
        createBookmark({
          questionId: orphanedQuestionId,
          createdAt: new Date('2026-02-01T00:00:00Z'),
        }),
      ];

      const deps = createDeps({ bookmarks, questionsById: {} });

      const result = await getBookmarks({}, deps);

      expect(result).toEqual({ ok: true, data: { rows: [] } });
    });
  });
});
