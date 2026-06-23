import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeQuestionRepository } from '@/src/application/test-helpers/fakes';
import { createQuestion } from '@/src/domain/test-helpers';

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

beforeAll(async () => {
  ({ createRequestCachedQuestionRepository } = await import('./cached-reads'));
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
});
