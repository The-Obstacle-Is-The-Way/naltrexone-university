import { createPracticeSession } from '@/src/domain/test-helpers';
import type { QuestionAvailability } from '@/src/domain/value-objects';
import { runSessionHistoryScoreContract } from '@/tests/shared/session-history-score-contract';
import { FakePracticeSessionRepository } from './fake-practice-session-repository';

runSessionHistoryScoreContract('FakePracticeSessionRepository', async () => ({
  async seed({ mode, items }) {
    const userId = crypto.randomUUID();
    const questionIds = items.map(() => crypto.randomUUID());
    const session = createPracticeSession({
      userId,
      mode,
      startedAt: new Date('2026-10-01T10:00:00Z'),
      endedAt: null,
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
    // The bank as the session ends, then as history is read.
    const availability = new Map<string, QuestionAvailability>(
      questionIds.map((id, index) => [
        id,
        items[index]?.removedBeforeEnd ? 'retired' : 'available',
      ]),
    );
    const repository = new FakePracticeSessionRepository([session], {
      availabilityByQuestionId: availability,
    });
    await repository.end(session.id, userId, new Date('2026-10-01T10:30:00Z'));
    for (const [index, id] of questionIds.entries()) {
      availability.set(id, items[index]?.now ?? 'available');
    }
    return { repository, userId };
  },
}));
