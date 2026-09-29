import { describe, expect, it } from 'vitest';
import { FakeQuestionRepository } from '@/src/application/test-helpers/fakes';
import {
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import { fetchSessionQuestionsAsBound } from './fetch-session-questions-as-bound';

describe('fetchSessionQuestionsAsBound', () => {
  it('reads each item as the revision it was bound to, keyed by question id', async () => {
    const current = createQuestion({ id: 'q1', stemMd: 'Current' });
    const bound = createQuestion({ id: 'q1', stemMd: 'Bound' });
    const repo = new FakeQuestionRepository([current, bound]);
    const session = createPracticeSession({
      questionIds: ['q1'],
      questionStates: [
        {
          questionId: 'q1',
          questionRevisionId: bound.revisionId,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
      ],
    });

    const byId = await fetchSessionQuestionsAsBound(repo, session);

    expect(byId.get('q1')?.stemMd).toBe('Bound');
  });

  it('short-circuits when the session has no items', async () => {
    const repo = new FakeQuestionRepository([createQuestion({ id: 'q1' })]);

    const byId = await fetchSessionQuestionsAsBound(repo, {
      questionStates: [],
    });

    expect(byId.size).toBe(0);
    expect(repo.findPublishedByBindingsCalls).toEqual([]);
  });
});
