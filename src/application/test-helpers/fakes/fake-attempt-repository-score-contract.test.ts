import {
  createAttempt,
  createChoice,
  createQuestion,
} from '@/src/domain/test-helpers';
import { omittedOutcome } from '@/src/domain/value-objects';
import {
  type AttemptScoreHarness,
  runAttemptScoreContract,
  type ScoredAttemptSeed,
} from '@/tests/shared/attempt-score-contract';
import { runAttemptedQuestionResultContract } from '@/tests/shared/attempted-question-result-contract';
import { FakeAttemptRepository } from './fake-attempt-repository';

const DAY_MS = 24 * 60 * 60 * 1000;

function createQuestionNow(now: ScoredAttemptSeed['now']) {
  return createQuestion({
    id: crypto.randomUUID(),
    status: now === 'available' ? 'published' : 'archived',
    availability: now,
    // Keyed B, so a revision can change the key.
    choices: [
      createChoice({ label: 'A', textMd: 'Choice A' }),
      createChoice({
        label: 'B',
        textMd: 'Choice B',
        isCorrect: true,
        sortOrder: 2,
      }),
    ],
  });
}

const createHarness = async (): Promise<AttemptScoreHarness> => ({
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
      {
        // A question revised since is listed with its new current revision
        // first, then the revision its attempts answered.
        questions: [...questionByKey].flatMap(([key, question]) => {
          const revisedAfter = attempts.find(
            (attempt) => attempt.question === key,
          )?.revisedAfter;
          if (!revisedAfter) return [question];
          const current = {
            ...question,
            revisionId: crypto.randomUUID(),
            stemMd: '# Reworded stem',
            choices: question.choices.map((choice) => {
              if (revisedAfter === 'key') {
                return { ...choice, isCorrect: !choice.isCorrect };
              }
              const reworded =
                (revisedAfter === 'key text' && choice.isCorrect) ||
                (revisedAfter === 'distractor' && !choice.isCorrect);
              return reworded
                ? { ...choice, textMd: `${choice.textMd}, reworded` }
                : choice;
            }),
          };
          return [current, question];
        }),
        itemsWithoutFairChance,
      },
    );
    const questionIds = new Map(
      [...questionByKey].map(([key, question]) => [key, question.id]),
    );
    return { repository, userId, now, questionIds };
  },
});

runAttemptScoreContract('FakeAttemptRepository', createHarness);
runAttemptedQuestionResultContract('FakeAttemptRepository', createHarness);
