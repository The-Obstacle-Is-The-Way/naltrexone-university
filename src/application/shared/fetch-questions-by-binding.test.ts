import { describe, expect, it } from 'vitest';
import type { QuestionRevisionBinding } from '@/src/application/ports/repositories';
import { FakeQuestionRepository } from '@/src/application/test-helpers/fakes';
import type { Question } from '@/src/domain/entities';
import { createQuestion } from '@/src/domain/test-helpers';
import {
  bindingKey,
  fetchQuestionsByBinding,
} from './fetch-questions-by-binding';

describe('fetchQuestionsByBinding', () => {
  it('keys each distinct binding to its own revision and omits unpublished questions', async () => {
    const current = createQuestion({ id: 'q1', stemMd: 'Current' });
    const older = createQuestion({ id: 'q1', stemMd: 'Older' });
    const archived = createQuestion({ id: 'q2', status: 'archived' });
    const repo = new FakeQuestionRepository([current, older, archived]);
    const unboundQ1 = { questionId: 'q1', questionRevisionId: null };
    const olderQ1 = { questionId: 'q1', questionRevisionId: older.revisionId };
    const unboundQ2 = { questionId: 'q2', questionRevisionId: null };

    const byBinding = await fetchQuestionsByBinding(repo, [
      unboundQ1,
      olderQ1,
      unboundQ1,
      unboundQ2,
    ]);

    expect(repo.findPublishedByBindingsCalls).toEqual([['q1', 'q1', 'q2']]);
    expect(byBinding.get(bindingKey(unboundQ1))?.stemMd).toBe('Current');
    expect(byBinding.get(bindingKey(olderQ1))?.stemMd).toBe('Older');
    expect(byBinding.has(bindingKey(unboundQ2))).toBe(false);
  });

  it('short-circuits when there are no bindings', async () => {
    const repo = new FakeQuestionRepository([createQuestion({ id: 'q1' })]);

    await expect(fetchQuestionsByBinding(repo, [])).resolves.toEqual(new Map());
    expect(repo.findPublishedByBindingsCalls).toEqual([]);
  });

  it('fails loudly when the repository swaps two revisions of one question', async () => {
    const current = createQuestion({ id: 'q1', stemMd: 'Current' });
    const older = createQuestion({ id: 'q1', stemMd: 'Older' });
    class SwappingQuestionRepository extends FakeQuestionRepository {
      override async findPublishedByBindings(
        bindings: readonly QuestionRevisionBinding[],
      ) {
        return [...(await super.findPublishedByBindings(bindings))].reverse();
      }
    }
    const repo = new SwappingQuestionRepository([current, older]);

    await expect(
      fetchQuestionsByBinding(repo, [
        { questionId: 'q1', questionRevisionId: current.revisionId },
        { questionId: 'q1', questionRevisionId: older.revisionId },
      ]),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it.each([
    [
      'returns them out of order',
      (found: readonly Question[]) => [...found].reverse(),
    ],
    [
      'returns an extra question',
      (found: readonly Question[]) => [...found, ...found],
    ],
  ])('fails loudly when the repository %s', async (_label, distort) => {
    class DistortingQuestionRepository extends FakeQuestionRepository {
      override async findPublishedByBindings(
        bindings: readonly QuestionRevisionBinding[],
      ) {
        return distort(await super.findPublishedByBindings(bindings));
      }
    }
    const repo = new DistortingQuestionRepository([
      createQuestion({ id: 'q1' }),
      createQuestion({ id: 'q2' }),
    ]);

    await expect(
      fetchQuestionsByBinding(repo, [
        { questionId: 'q1', questionRevisionId: null },
        { questionId: 'q2', questionRevisionId: null },
      ]),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
