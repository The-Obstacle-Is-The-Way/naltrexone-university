import { describe, expect, it } from 'vitest';
import type { QuestionRevisionBinding } from '@/src/application/ports/repositories';
import { FakeQuestionRepository } from '@/src/application/test-helpers/fakes';
import type { Question } from '@/src/domain/entities';
import { createQuestion } from '@/src/domain/test-helpers';
import {
  bindingKey,
  fetchOwnedQuestionsByBinding,
} from './fetch-questions-by-binding';

describe('fetchOwnedQuestionsByBinding', () => {
  it('keys each distinct binding to its own revision, keeps a withdrawn question and omits a missing one', async () => {
    const current = createQuestion({ id: 'q1', stemMd: 'Current' });
    const older = createQuestion({
      id: 'q1',
      revisionId: crypto.randomUUID(),
      stemMd: 'Older',
    });
    const archived = createQuestion({ id: 'q2', status: 'archived' });
    const repo = new FakeQuestionRepository([current, older, archived]);
    const currentQ1 = {
      questionId: 'q1',
      questionRevisionId: current.revisionId,
    };
    const olderQ1 = { questionId: 'q1', questionRevisionId: older.revisionId };
    const archivedQ2 = {
      questionId: 'q2',
      questionRevisionId: archived.revisionId,
    };
    const missing = {
      questionId: 'q3',
      questionRevisionId: crypto.randomUUID(),
    };

    const byBinding = await fetchOwnedQuestionsByBinding(repo, [
      currentQ1,
      olderQ1,
      currentQ1,
      archivedQ2,
      missing,
    ]);

    expect(repo.findByIdsForSessionCalls).toEqual([['q1', 'q1', 'q2', 'q3']]);
    expect(byBinding.get(bindingKey(currentQ1))?.stemMd).toBe('Current');
    expect(byBinding.get(bindingKey(olderQ1))?.stemMd).toBe('Older');
    expect(byBinding.get(bindingKey(archivedQ2))?.status).toBe('archived');
    expect(byBinding.has(bindingKey(missing))).toBe(false);
  });

  it('short-circuits when there are no bindings', async () => {
    const repo = new FakeQuestionRepository([createQuestion({ id: 'q1' })]);

    await expect(fetchOwnedQuestionsByBinding(repo, [])).resolves.toEqual(
      new Map(),
    );
    expect(repo.findByIdsForSessionCalls).toEqual([]);
  });

  it('fails loudly when the repository swaps two revisions of one question', async () => {
    const current = createQuestion({ id: 'q1', stemMd: 'Current' });
    const older = createQuestion({
      id: 'q1',
      revisionId: crypto.randomUUID(),
      stemMd: 'Older',
    });
    class SwappingQuestionRepository extends FakeQuestionRepository {
      override async findByIdsForSession(
        bindings: readonly QuestionRevisionBinding[],
      ) {
        return [...(await super.findByIdsForSession(bindings))].reverse();
      }
    }
    const repo = new SwappingQuestionRepository([current, older]);

    await expect(
      fetchOwnedQuestionsByBinding(repo, [
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
      override async findByIdsForSession(
        bindings: readonly QuestionRevisionBinding[],
      ) {
        return distort(await super.findByIdsForSession(bindings));
      }
    }
    const q1 = createQuestion({ id: 'q1' });
    const q2 = createQuestion({ id: 'q2' });
    const repo = new DistortingQuestionRepository([q1, q2]);

    await expect(
      fetchOwnedQuestionsByBinding(repo, [
        { questionId: 'q1', questionRevisionId: q1.revisionId },
        { questionId: 'q2', questionRevisionId: q2.revisionId },
      ]),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
