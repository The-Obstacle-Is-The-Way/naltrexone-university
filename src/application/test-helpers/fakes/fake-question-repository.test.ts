import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { createQuestion } from '@/src/domain/test-helpers';
import { FakeQuestionRepository } from './fake-question-repository';

describe('FakeQuestionRepository', () => {
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
