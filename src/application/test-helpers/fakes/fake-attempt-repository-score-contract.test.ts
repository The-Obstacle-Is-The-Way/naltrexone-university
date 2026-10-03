import { createAttempt, createQuestion } from '@/src/domain/test-helpers';
import { omittedOutcome } from '@/src/domain/value-objects';
import {
  runAttemptScoreContract,
  type ScoredAttemptSeed,
} from '@/tests/shared/attempt-score-contract';
import { FakeAttemptRepository } from './fake-attempt-repository';

const DAY_MS = 24 * 60 * 60 * 1000;

function createQuestionNow(now: ScoredAttemptSeed['now']) {
  return createQuestion({
    id: crypto.randomUUID(),
    status: now === 'available' ? 'published' : 'archived',
    availability: now,
  });
}

runAttemptScoreContract('FakeAttemptRepository', async () => ({
  async seed(attempts) {
    const userId = crypto.randomUUID();
    const now = new Date('2026-10-03T12:00:00Z');
    const questionByKey = new Map(
      [...new Set(attempts.map((attempt) => attempt.question))].map((key) => [
        key,
        createQuestionNow(
          attempts.find((attempt) => attempt.question === key)?.now ??
            'available',
        ),
      ]),
    );
    const itemsWithoutFairChance: {
      practiceSessionId: string;
      questionId: string;
    }[] = [];
    // The learner's one exam, ended after any removed question left the bank.
    const examId = crypto.randomUUID();
    const repository = new FakeAttemptRepository(
      attempts.map((attempt) => {
        const question = questionByKey.get(attempt.question);
        if (!question) throw new Error('question');
        const practiceSessionId = attempt.inExam ? examId : null;
        if (practiceSessionId && attempt.removedBeforeEnd) {
          itemsWithoutFairChance.push({
            practiceSessionId,
            questionId: question.id,
          });
        }
        return {
          ...createAttempt({
            userId,
            questionId: question.id,
            questionRevisionId: question.revisionId,
            practiceSessionId,
            ...(attempt.outcome === 'omitted'
              ? { outcome: omittedOutcome() }
              : {}),
            isCorrect: attempt.outcome === 'correct',
            answeredAt: new Date(now.getTime() - attempt.daysAgo * DAY_MS),
          }),
          sessionMode: practiceSessionId ? ('exam' as const) : null,
          sessionEndedAt: practiceSessionId ? now : null,
        };
      }),
      { questions: [...questionByKey.values()], itemsWithoutFairChance },
    );
    return { repository, userId, now };
  },
}));
