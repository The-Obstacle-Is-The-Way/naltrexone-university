import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { Question } from '@/src/domain/entities';
import { createQuestion } from '@/src/domain/test-helpers';
import { FakeQuestionRepository } from './fake-question-repository';

function bindingOf(question: Question) {
  return { questionId: question.id, questionRevisionId: question.revisionId };
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

    await expect(repo.findByIdForSession(bindingOf(archived))).resolves.toEqual(
      archived,
    );
    await expect(
      repo.findByIdsForSession([
        bindingOf(draft),
        { questionId: 'q-missing', questionRevisionId: crypto.randomUUID() },
        bindingOf(published),
        bindingOf(archived),
      ]),
    ).resolves.toEqual([draft, published, archived]);
  });

  it('reads the first listed revision of a question as current, and a session item as its bound revision', async () => {
    const current = createQuestion({ id: 'q1', stemMd: 'Current' });
    const older = createQuestion({
      id: 'q1',
      revisionId: crypto.randomUUID(),
      stemMd: 'Older',
    });
    const repo = new FakeQuestionRepository([current, older]);

    await expect(repo.findPublishedById('q1')).resolves.toBe(current);
    await expect(repo.findPublishedByIds(['q1'])).resolves.toEqual([current]);
    await expect(repo.findByIdForSession(bindingOf(current))).resolves.toBe(
      current,
    );
    await expect(repo.findByIdForSession(bindingOf(older))).resolves.toEqual({
      ...older,
      isCurrentRevision: false,
    });
    await expect(
      repo.listPublishedCandidateIds({ tagSlugs: [], difficulties: [] }),
    ).resolves.toEqual(['q1']);
  });

  it('finds a question id by slug whatever its status, and batches owned bindings in order', async () => {
    const current = createQuestion({ id: 'q1', stemMd: 'Current' });
    const older = createQuestion({
      id: 'q1',
      revisionId: crypto.randomUUID(),
      stemMd: 'Older',
    });
    const archived = createQuestion({
      id: 'q2',
      slug: 'q-archived',
      status: 'archived',
    });
    const repo = new FakeQuestionRepository([current, older, archived]);

    await expect(repo.findIdBySlug(archived.slug)).resolves.toBe('q2');
    await expect(repo.findIdBySlug('no-such-slug')).resolves.toBeNull();
    await expect(
      repo.findByIdsForSession([
        bindingOf(current),
        bindingOf(older),
        { questionId: 'q-missing', questionRevisionId: crypto.randomUUID() },
        bindingOf(archived),
      ]),
    ).resolves.toEqual([
      current,
      { ...older, isCurrentRevision: false },
      archived,
    ]);
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

  it('reads a bound revision under its question status, as the adapter does', async () => {
    const current = createQuestion({ id: 'q1', status: 'archived' });
    const older = createQuestion({
      id: 'q1',
      revisionId: crypto.randomUUID(),
      stemMd: 'Older',
      status: 'published',
    });
    const repo = new FakeQuestionRepository([current, older]);
    const olderBinding = {
      questionId: 'q1',
      questionRevisionId: older.revisionId,
    };

    await expect(repo.findByIdForSession(olderBinding)).resolves.toMatchObject({
      stemMd: 'Older',
      status: 'archived',
    });
    await expect(repo.findByIdsForSession([olderBinding])).resolves.toEqual([
      expect.objectContaining({ stemMd: 'Older', status: 'archived' }),
    ]);
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
