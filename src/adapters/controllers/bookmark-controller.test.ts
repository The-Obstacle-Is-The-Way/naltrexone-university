import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  BookmarkRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import type { Bookmark, Question } from '@/src/domain/entities';
import { getBookmarks, toggleBookmark } from './bookmark-controller';

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
  bookmarkExists?: boolean;
  bookmarks?: readonly Bookmark[];
  questionsById?: Record<string, Question>;
}) {
  const user = overrides?.user ?? createUser();
  const isEntitled = overrides?.isEntitled ?? true;
  const question =
    overrides?.question ??
    createQuestion({
      id: '11111111-1111-1111-1111-111111111111',
      slug: 'q-1',
    });
  const bookmarkExists = overrides?.bookmarkExists ?? false;
  const bookmarks = overrides?.bookmarks ?? [
    createBookmark({
      questionId: '11111111-1111-1111-1111-111111111111',
    }),
  ];

  const questionsById = overrides?.questionsById ?? {
    [question.id]: question,
  };

  const authGateway: AuthGateway = {
    getCurrentUser: async () => user as never,
    requireUser: async () => user as never,
    ...overrides?.authGateway,
  };

  const checkEntitlementUseCase = {
    execute: vi.fn(async () => ({ isEntitled })),
  };

  const bookmarkRepository: BookmarkRepository = {
    exists: vi.fn(async () => bookmarkExists),
    add: vi.fn(async () =>
      createBookmark({ questionId: '11111111-1111-1111-1111-111111111111' }),
    ),
    remove: vi.fn(async () => undefined),
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
  };
}

describe('bookmark-controller', () => {
  describe('toggleBookmark', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await toggleBookmark(
        { questionId: 'not-a-uuid' },
        deps as never,
      );

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
        deps as never,
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
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.bookmarkRepository.exists).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND when question does not exist', async () => {
      const deps = createDeps({ question: null, questionsById: {} });

      const result = await toggleBookmark(
        { questionId: '11111111-1111-1111-1111-111111111111' },
        deps as never,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Question not found' },
      });
      expect(deps.bookmarkRepository.exists).not.toHaveBeenCalled();
    });

    it('removes the bookmark when it exists', async () => {
      const deps = createDeps({ bookmarkExists: true });
      const questionId = '11111111-1111-1111-1111-111111111111';

      const result = await toggleBookmark({ questionId }, deps as never);

      expect(result).toEqual({ ok: true, data: { bookmarked: false } });
      expect(deps.bookmarkRepository.exists).toHaveBeenCalledWith(
        'user_1',
        questionId,
      );
      expect(deps.bookmarkRepository.remove).toHaveBeenCalledWith(
        'user_1',
        questionId,
      );
      expect(deps.bookmarkRepository.add).not.toHaveBeenCalled();
    });

    it('adds the bookmark when it does not exist', async () => {
      const deps = createDeps({ bookmarkExists: false });
      const questionId = '11111111-1111-1111-1111-111111111111';

      const result = await toggleBookmark({ questionId }, deps as never);

      expect(result).toEqual({ ok: true, data: { bookmarked: true } });
      expect(deps.bookmarkRepository.exists).toHaveBeenCalledWith(
        'user_1',
        questionId,
      );
      expect(deps.bookmarkRepository.add).toHaveBeenCalledWith(
        'user_1',
        questionId,
      );
      expect(deps.bookmarkRepository.remove).not.toHaveBeenCalled();
    });
  });

  describe('getBookmarks', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await getBookmarks({ unexpected: true }, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await getBookmarks({}, deps as never);

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

      expect(deps.bookmarkRepository.listByUserId).toHaveBeenCalledWith(
        'user_1',
      );
      expect(deps.questionRepository.findPublishedByIds).toHaveBeenCalledWith([
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
      ]);
    });
  });
});
