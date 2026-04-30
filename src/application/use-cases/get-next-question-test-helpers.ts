import {
  createQuestionSeed,
  createSeed,
  shuffleWithSeed,
} from '@/src/domain/services';
import {
  createAttempt,
  createChoice,
  createPracticeSession,
  createQuestion,
  createTag,
} from '@/src/domain/test-helpers';
import { ApplicationError } from '../errors';
import type { QuestionFilters } from '../ports/repositories';
import {
  FakeAttemptRepository,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '../test-helpers/fakes';
import { GetNextQuestionUseCase } from './get-next-question';

export const USER_ID = 'user-1';
export const SESSION_ID = 'session-1';
export const ANSWERED_AT = new Date('2026-01-31T00:00:00Z');
export const EMPTY_FILTERS: QuestionFilters = {
  tagSlugs: [],
  difficulties: [],
};

type TestDepsOverrides = {
  questions?: ConstructorParameters<typeof FakeQuestionRepository>[0];
  attempts?: ConstructorParameters<typeof FakeAttemptRepository>[0];
  sessions?: ConstructorParameters<typeof FakePracticeSessionRepository>[0];
  now?: () => Date;
};

export function createTestDeps(overrides: TestDepsOverrides = {}) {
  const questionRepo = new FakeQuestionRepository(overrides.questions ?? []);
  const attemptRepo = new FakeAttemptRepository(overrides.attempts ?? []);
  const sessionRepo = new FakePracticeSessionRepository(
    overrides.sessions ?? [],
  );
  const getNextQuestion = new GetNextQuestionUseCase(
    questionRepo,
    attemptRepo,
    sessionRepo,
    overrides.now,
  );

  return { questionRepo, attemptRepo, sessionRepo, getNextQuestion };
}

type QuestionState = ReturnType<
  typeof createPracticeSession
>['questionStates'][number];

export function createQuestionState(
  questionId: string,
  overrides: Partial<QuestionState> = {},
): QuestionState {
  return {
    questionId,
    markedForReview: false,
    latestSelectedChoiceId: null,
    latestIsCorrect: null,
    latestAnsweredAt: null,
    draftSelectedChoiceId: null,
    draftSavedAt: null,
    draftCumulativeMs: 0,
    ...overrides,
  };
}

export function createSingleChoiceQuestion(
  questionId: string,
  choiceId: string,
) {
  return createQuestion({
    id: questionId,
    choices: [createChoice({ id: choiceId, questionId })],
  });
}

export function createShuffleQuestion(questionId: string) {
  return createQuestion({
    id: questionId,
    choices: [
      createChoice({ id: 'c1', questionId, label: 'A', sortOrder: 1 }),
      createChoice({ id: 'c2', questionId, label: 'B', sortOrder: 2 }),
      createChoice({ id: 'c3', questionId, label: 'C', sortOrder: 3 }),
      createChoice({ id: 'c4', questionId, label: 'D', sortOrder: 4 }),
    ],
  });
}

function getUtcDayStartMs(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function shuffleQuickPracticeCandidates(
  candidateIds: readonly string[],
  userId: string,
  now: Date,
): string[] {
  const seed = createSeed(userId, getUtcDayStartMs(now));
  return shuffleWithSeed(candidateIds.slice().sort(), seed);
}

function shuffleQuickPracticeCandidatesWithoutCanonicalization(
  candidateIds: readonly string[],
  userId: string,
  now: Date,
): string[] {
  const seed = createSeed(userId, getUtcDayStartMs(now));
  return shuffleWithSeed(candidateIds, seed);
}

export function findUserForRepositoryOrderVariance(
  firstOrder: readonly string[],
  secondOrder: readonly string[],
  now: Date,
): string {
  const userId =
    Array.from(
      { length: 5_000 },
      (_, i) => `order-variance-user-${i + 1}`,
    ).find((candidate) => {
      const first =
        shuffleQuickPracticeCandidatesWithoutCanonicalization(
          firstOrder,
          candidate,
          now,
        )[0] ?? null;
      const second =
        shuffleQuickPracticeCandidatesWithoutCanonicalization(
          secondOrder,
          candidate,
          now,
        )[0] ?? null;
      return first !== second;
    }) ?? null;

  if (!userId) {
    throw new Error(
      'Test setup failure: expected to find a userId whose first candidate changes when repository order changes',
    );
  }

  return userId;
}

export function createQuickPracticeQuestion(
  questionId: string,
  createdAtIso: string,
) {
  return createQuestion({
    id: questionId,
    slug: questionId,
    createdAt: new Date(createdAtIso),
    choices: [createChoice({ id: `choice-${questionId}`, questionId })],
  });
}

export function createFiveQuickPracticeQuestions() {
  return [
    createQuickPracticeQuestion('q1', '2026-01-01T00:00:00.000Z'),
    createQuickPracticeQuestion('q2', '2026-01-02T00:00:00.000Z'),
    createQuickPracticeQuestion('q3', '2026-01-03T00:00:00.000Z'),
    createQuickPracticeQuestion('q4', '2026-01-04T00:00:00.000Z'),
    createQuickPracticeQuestion('q5', '2026-01-05T00:00:00.000Z'),
  ];
}

export function findUserForShuffledFirst(
  candidateIds: readonly string[],
  now: Date,
): string {
  const originalFirst = candidateIds[0];
  const userId =
    Array.from({ length: 1_000 }, (_, i) => `shuffle-user-${i + 1}`).find(
      (candidate) =>
        shuffleQuickPracticeCandidates(candidateIds, candidate, now)[0] !==
        originalFirst,
    ) ?? null;

  if (!userId) {
    throw new Error(
      'Test setup failure: expected to find a userId whose daily shuffle changes the first candidate',
    );
  }

  return userId;
}

export {
  ApplicationError,
  FakeAttemptRepository,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
  GetNextQuestionUseCase,
  createAttempt,
  createChoice,
  createPracticeSession,
  createQuestion,
  createQuestionSeed,
  createTag,
  shuffleWithSeed,
};
