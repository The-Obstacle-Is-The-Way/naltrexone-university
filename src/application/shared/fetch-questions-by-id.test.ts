import { describe, expect, it } from 'vitest';
import { createQuestion } from '@/src/domain/test-helpers';
import { FakeQuestionRepository } from '../test-helpers/fakes';
import { fetchQuestionsById } from './fetch-questions-by-id';

describe('fetchQuestionsById', () => {
  it('deduplicates ids before querying and returns a map keyed by id', async () => {
    const repo = new FakeQuestionRepository([
      createQuestion({ id: 'q1', slug: 'q-1', stemMd: 'Stem 1' }),
      createQuestion({ id: 'q2', slug: 'q-2', stemMd: 'Stem 2' }),
    ]);

    const byId = await fetchQuestionsById(repo, [
      'q1',
      'q2',
      'q1',
      'q-missing',
    ]);

    expect(repo.findPublishedByIdsCalls).toEqual([['q1', 'q2', 'q-missing']]);
    expect(byId.get('q1')?.id).toBe('q1');
    expect(byId.get('q2')?.id).toBe('q2');
    expect(byId.has('q-missing')).toBe(false);
  });

  it('short-circuits when ids are empty', async () => {
    const repo = new FakeQuestionRepository([
      createQuestion({ id: 'q1', slug: 'q-1', stemMd: 'Stem 1' }),
    ]);

    const byId = await fetchQuestionsById(repo, []);

    expect(byId.size).toBe(0);
    expect(repo.findPublishedByIdsCalls).toEqual([]);
  });
});
