import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  FakeQuestionRepository,
  FakeTagRepository,
} from '@/src/application/test-helpers/fakes';
import { createQuestion, createTag } from '@/src/domain/test-helpers';

vi.mock('server-only', () => ({}));

vi.mock('react', () => ({
  cache<TArgs extends readonly unknown[], TResult>(
    fn: (...args: TArgs) => TResult,
  ) {
    const results = new Map<string, TResult>();

    return (...args: TArgs): TResult => {
      const cacheKey = JSON.stringify(args);
      if (!results.has(cacheKey)) {
        results.set(cacheKey, fn(...args));
      }

      return results.get(cacheKey) as TResult;
    };
  },
}));

let createRequestCachedQuestionRepository: typeof import('./cached-reads').createRequestCachedQuestionRepository;
let createRequestCachedTagRepository: typeof import('./cached-reads').createRequestCachedTagRepository;

beforeAll(async () => {
  ({ createRequestCachedQuestionRepository, createRequestCachedTagRepository } =
    await import('./cached-reads'));
});

describe('cached-reads coverage seam', () => {
  it('deduplicates session-owned id reads through the request cache wrapper', async () => {
    class CountingQuestionRepository extends FakeQuestionRepository {
      findByIdForSessionCallCount = 0;

      override async findByIdForSession(id: string) {
        this.findByIdForSessionCallCount += 1;
        return super.findByIdForSession(id);
      }
    }

    const rawRepository = new CountingQuestionRepository([
      createQuestion({
        id: 'question-1',
        slug: 'question-1',
        status: 'archived',
      }),
    ]);
    const repository = createRequestCachedQuestionRepository(rawRepository);

    const first = await repository.findByIdForSession('question-1');
    const second = await repository.findByIdForSession('question-1');

    expect(rawRepository.findByIdForSessionCallCount).toBe(1);
    expect(first?.status).toBe('archived');
    expect(second?.status).toBe('archived');
  });

  it('normalizes session-owned batch reads while preserving caller order', async () => {
    class CountingQuestionRepository extends FakeQuestionRepository {
      findByIdsForSessionCallCount = 0;

      override async findByIdsForSession(ids: readonly string[]) {
        this.findByIdsForSessionCallCount += 1;
        return super.findByIdsForSession(ids);
      }
    }

    const rawRepository = new CountingQuestionRepository([
      createQuestion({ id: 'a', slug: 'question-a', status: 'archived' }),
      createQuestion({ id: 'b', slug: 'question-b', status: 'draft' }),
    ]);
    const repository = createRequestCachedQuestionRepository(rawRepository);

    const first = await repository.findByIdsForSession(['b', 'a', 'a']);
    const second = await repository.findByIdsForSession(['a', 'b']);

    expect(rawRepository.findByIdsForSessionCallCount).toBe(1);
    expect(rawRepository.findByIdsForSessionCalls).toEqual([['a', 'b']]);
    expect(first.map((question) => question.id)).toEqual(['b', 'a', 'a']);
    expect(second.map((question) => question.id)).toEqual(['a', 'b']);
  });

  it('deduplicates published id and slug reads through the request cache wrapper', async () => {
    class CountingQuestionRepository extends FakeQuestionRepository {
      findPublishedByIdCallCount = 0;
      findPublishedBySlugCallCount = 0;

      override async findPublishedById(id: string) {
        this.findPublishedByIdCallCount += 1;
        return super.findPublishedById(id);
      }

      override async findPublishedBySlug(slug: string) {
        this.findPublishedBySlugCallCount += 1;
        return super.findPublishedBySlug(slug);
      }
    }

    const rawRepository = new CountingQuestionRepository([
      createQuestion({ id: 'question-1', slug: 'question-1' }),
    ]);
    const repository = createRequestCachedQuestionRepository(rawRepository);

    await repository.findPublishedById('question-1');
    const byId = await repository.findPublishedById('question-1');
    await repository.findPublishedBySlug('question-1');
    const bySlug = await repository.findPublishedBySlug('question-1');

    expect(rawRepository.findPublishedByIdCallCount).toBe(1);
    expect(rawRepository.findPublishedBySlugCallCount).toBe(1);
    expect(byId?.id).toBe('question-1');
    expect(bySlug?.id).toBe('question-1');
  });

  it('normalizes published batch reads while preserving caller order and dropping unknown ids', async () => {
    const rawRepository = new FakeQuestionRepository([
      createQuestion({ id: 'a', slug: 'question-a' }),
      createQuestion({ id: 'b', slug: 'question-b' }),
    ]);
    const repository = createRequestCachedQuestionRepository(rawRepository);

    const first = await repository.findPublishedByIds([
      'b',
      'missing',
      'a',
      'a',
    ]);
    const second = await repository.findPublishedByIds(['missing', 'a', 'b']);

    expect(rawRepository.findPublishedByIdsCalls).toEqual([
      ['a', 'b', 'missing'],
    ]);
    expect(first.map((question) => question.id)).toEqual(['b', 'a', 'a']);
    expect(second.map((question) => question.id)).toEqual(['a', 'b']);
  });

  it('answers empty batch reads without reading the repository', async () => {
    const rawRepository = new FakeQuestionRepository([]);
    const repository = createRequestCachedQuestionRepository(rawRepository);

    await expect(repository.findPublishedByIds([])).resolves.toEqual([]);
    await expect(repository.findByIdsForSession([])).resolves.toEqual([]);
    expect(rawRepository.findPublishedByIdsCalls).toEqual([]);
    expect(rawRepository.findByIdsForSessionCalls).toEqual([]);
  });

  it('passes candidate filters straight through without caching', async () => {
    const rawRepository = new FakeQuestionRepository([
      createQuestion({ id: 'a', slug: 'question-a', difficulty: 'easy' }),
    ]);
    const repository = createRequestCachedQuestionRepository(rawRepository);
    const filters = { tagSlugs: [], difficulties: ['easy' as const] };

    await expect(
      repository.listPublishedCandidateIds(filters),
    ).resolves.toEqual(['a']);
    await repository.listPublishedCandidateIds(filters);
    await expect(repository.countPublishedCandidateIds(filters)).resolves.toBe(
      1,
    );

    expect(rawRepository.listPublishedCandidateIdsCalls).toEqual([
      filters,
      filters,
    ]);
    expect(rawRepository.countPublishedCandidateIdsCalls).toEqual([filters]);
  });

  it('deduplicates tag list reads through the request cache wrapper', async () => {
    class CountingTagRepository extends FakeTagRepository {
      listAllCallCount = 0;

      override async listAll() {
        this.listAllCallCount += 1;
        return super.listAll();
      }
    }

    const rawRepository = new CountingTagRepository([
      createTag({ slug: 'opioids' }),
    ]);
    const repository = createRequestCachedTagRepository(rawRepository);

    await repository.listAll();
    const tags = await repository.listAll();

    expect(rawRepository.listAllCallCount).toBe(1);
    expect(tags.map((tag) => tag.slug)).toEqual(['opioids']);
  });
});
