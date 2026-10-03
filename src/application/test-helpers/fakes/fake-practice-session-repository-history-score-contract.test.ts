import { createPracticeSession } from '@/src/domain/test-helpers';
import { runSessionHistoryScoreContract } from '@/tests/shared/session-history-score-contract';
import { FakePracticeSessionRepository } from './fake-practice-session-repository';

runSessionHistoryScoreContract('FakePracticeSessionRepository', async () => ({
  async seed(items) {
    const userId = crypto.randomUUID();
    const questionIds = items.map(() => crypto.randomUUID());
    const session = createPracticeSession({
      userId,
      mode: 'tutor',
      startedAt: new Date('2026-10-01T10:00:00Z'),
      endedAt: new Date('2026-10-01T10:30:00Z'),
      questionIds,
      questionStates: items.map((item, index) => ({
        questionId: questionIds[index] ?? '',
        markedForReview: false,
        latestSelectedChoiceId:
          item.answer === 'unanswered' ? null : crypto.randomUUID(),
        latestIsCorrect:
          item.answer === 'correct'
            ? true
            : item.answer === 'incorrect'
              ? false
              : null,
        latestAnsweredAt:
          item.answer === 'unanswered'
            ? null
            : new Date('2026-10-01T10:10:00Z'),
      })),
    });
    const repository = new FakePracticeSessionRepository([session], {
      unpublishedQuestionIds: new Set(
        questionIds.filter((_, index) => !items[index]?.published),
      ),
    });
    return { repository, userId };
  },
}));
