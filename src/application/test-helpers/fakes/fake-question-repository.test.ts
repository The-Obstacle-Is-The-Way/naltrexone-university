import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { createQuestion } from '@/src/domain/test-helpers';
import { FakeQuestionRepository } from './fake-question-repository';

function unbound(questionId: string) {
  return { questionId, questionRevisionId: null };
}

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

    await expect(
      repo.findByIdForSession(unbound('q-archived')),
    ).resolves.toEqual(archived);
    await expect(
      repo.findByIdsForSession(
        ['q-draft', 'q-missing', 'q-published', 'q-archived'].map(unbound),
      ),
    ).resolves.toEqual([draft, published, archived]);
  });

  it('reads the first listed revision of a question except for a session item bound to another', async () => {
    const current = createQuestion({ id: 'q1', stemMd: 'Current' });
    const older = createQuestion({ id: 'q1', stemMd: 'Older' });
    const repo = new FakeQuestionRepository([current, older]);

    await expect(repo.findPublishedById('q1')).resolves.toBe(current);
    await expect(repo.findPublishedByIds(['q1'])).resolves.toEqual([current]);
    await expect(repo.findByIdForSession(unbound('q1'))).resolves.toBe(current);
    await expect(
      repo.findByIdForSession({
        questionId: 'q1',
        questionRevisionId: older.revisionId,
      }),
    ).resolves.toBe(older);
    await expect(
      repo.listPublishedCandidateIds({ tagSlugs: [], difficulties: [] }),
    ).resolves.toEqual(['q1']);
  });

  it('refuses a session item bound to a revision it does not hold', async () => {
    const repo = new FakeQuestionRepository([createQuestion({ id: 'q1' })]);

    await expect(
      repo.findByIdForSession({
        questionId: 'q1',
        questionRevisionId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
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
