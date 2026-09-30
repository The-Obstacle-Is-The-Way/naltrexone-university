import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { Question } from '@/src/domain/entities';
import { createQuestion, createTag } from '@/src/domain/test-helpers';
import { FakeQuestionRepository } from './fake-question-repository';

function bindingOf(question: Question) {
  return { questionId: question.id, questionRevisionId: question.revisionId };
}

// Another revision of a question, sharing its slug, status, tags and
// timestamps, so an expectation does not depend on two clock reads.
function revisionOf(question: Question, overrides: Partial<Question> = {}) {
  return createQuestion({
    id: question.id,
    slug: question.slug,
    status: question.status,
    tags: question.tags,
    createdAt: question.createdAt,
    updatedAt: question.updatedAt,
    revisionId: crypto.randomUUID(),
    ...overrides,
  });
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
    const older = revisionOf(current, { stemMd: 'Older' });
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
    const older = revisionOf(current, { stemMd: 'Older' });
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

  it('reads the first listed revision as current whatever its fixture says', async () => {
    const current = createQuestion({ id: 'q1', isCurrentRevision: false });
    const older = revisionOf(current);
    const repo = new FakeQuestionRepository([current, older]);

    await expect(repo.findByIdForSession(bindingOf(current))).resolves.toEqual({
      ...current,
      isCurrentRevision: true,
    });
    await expect(repo.findByIdForSession(bindingOf(older))).resolves.toEqual({
      ...older,
      isCurrentRevision: false,
    });
  });

  // The adapter reads a revision's content from the revision and everything
  // else from its question.
  it("reads a bound revision under its question's slug, status, tags and timestamps, as the adapter does", async () => {
    const current = createQuestion({
      id: 'q1',
      slug: 'q-current',
      status: 'archived',
      difficulty: 'hard',
      tags: [createTag({ slug: 'opioids' })],
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
    });
    const older = createQuestion({
      id: 'q1',
      revisionId: crypto.randomUUID(),
      slug: 'q-older',
      stemMd: 'Older',
      status: 'published',
      difficulty: 'easy',
      tags: [createTag({ slug: 'alcohol' })],
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-03-01T00:00:00Z'),
    });
    const repo = new FakeQuestionRepository([current, older]);
    const expected = {
      ...older,
      isCurrentRevision: false,
      slug: current.slug,
      status: current.status,
      tags: current.tags,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
    };

    await expect(repo.findByIdForSession(bindingOf(older))).resolves.toEqual(
      expected,
    );
    await expect(repo.findByIdsForSession([bindingOf(older)])).resolves.toEqual(
      [expected],
    );
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
