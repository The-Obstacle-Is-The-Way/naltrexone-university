import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { createQuestion } from '@/src/domain/test-helpers';
import { FakeQuestionRepository } from './fake-question-repository';

describe('FakeQuestionRepository', () => {
  it('keeps published lookups public-only while session-owned lookups ignore publication status', async () => {
    const published = createQuestion({
      id: 'q-published',
      status: 'published',
    });
    const archived = createQuestion({ id: 'q-archived', status: 'archived' });
    const draft = createQuestion({ id: 'q-draft', status: 'draft' });
    const repo = new FakeQuestionRepository([published, archived, draft]);

    await expect(repo.findPublishedById('q-archived')).resolves.toBeNull();
    await expect(
      repo.findPublishedByIds(['q-draft', 'q-published', 'q-archived']),
    ).resolves.toEqual([published]);

    await expect(repo.findByIdForSession('q-archived')).resolves.toEqual(
      archived,
    );
    await expect(
      repo.findByIdsForSession([
        'q-draft',
        'q-missing',
        'q-published',
        'q-archived',
      ]),
    ).resolves.toEqual([draft, published, archived]);
  });

  it('throws VALIDATION_ERROR when status filters are provided without userId', async () => {
    const repo = new FakeQuestionRepository([createQuestion({ id: 'q1' })]);

    const promise = repo.listPublishedCandidateIds({
      tagSlugs: [],
      difficulties: [],
      statuses: ['incorrect'],
    });

    await expect(promise).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'userId is required when filtering by status',
      ),
    );
  });

  it('throws VALIDATION_ERROR from count when status filters are provided without userId', async () => {
    const repo = new FakeQuestionRepository([createQuestion({ id: 'q1' })]);

    const promise = repo.countPublishedCandidateIds({
      tagSlugs: [],
      difficulties: [],
      statuses: ['incorrect'],
    });

    await expect(promise).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'userId is required when filtering by status',
      ),
    );
  });
});
