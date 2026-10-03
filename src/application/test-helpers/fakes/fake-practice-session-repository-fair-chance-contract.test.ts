import { createPracticeSession } from '@/src/domain/test-helpers';
import { runSessionEndFairChanceContract } from '@/tests/shared/session-end-fair-chance-contract';
import { FakePracticeSessionRepository } from './fake-practice-session-repository';

runSessionEndFairChanceContract('FakePracticeSessionRepository', async () => ({
  async seed({ mode, items }) {
    const userId = crypto.randomUUID();
    const questionIds = items.map(() => crypto.randomUUID());
    const session = createPracticeSession({
      userId,
      mode,
      questionIds,
      questionStates: items.map((item, index) => ({
        questionId: questionIds[index] ?? '',
        markedForReview: false,
        latestSelectedChoiceId: item.answered ? crypto.randomUUID() : null,
        latestIsCorrect: item.answered ? true : null,
        latestAnsweredAt: item.answered
          ? new Date('2026-10-03T12:00:00Z')
          : null,
      })),
      endedAt: null,
    });
    const repository = new FakePracticeSessionRepository([session], {
      unpublishedQuestionIds: new Set(
        questionIds.filter((_id, index) => !items[index]?.published),
      ),
    });
    return { repository, sessionId: session.id, userId };
  },
}));
