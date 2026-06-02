import type { Attempt } from '../entities/attempt';
import type { Bookmark } from '../entities/bookmark';
import type { Choice } from '../entities/choice';
import type {
  PracticeSession,
  PracticeSessionQuestionState,
} from '../entities/practice-session';
import type { Question } from '../entities/question';
import type {
  QuestionRatingFeedback,
  QuestionReportFeedback,
} from '../entities/question-feedback';
import type { Subscription } from '../entities/subscription';
import type { Tag } from '../entities/tag';
import type { User } from '../entities/user';
import { DAY_MS } from '../services';
import type {
  AnswerOutcome,
  ChoiceLabel,
  PracticeMode,
  QuestionDifficulty,
  QuestionStatus,
  SubscriptionPlan,
  SubscriptionStatus,
  TagKind,
} from '../value-objects';
import { answeredOutcome } from '../value-objects';

function createUuid(): string {
  return crypto.randomUUID();
}

export function createUser(overrides: Partial<User> = {}): User {
  const now = new Date();
  return {
    id: createUuid(),
    email: 'user@example.com',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

type AttemptSessionMode = PracticeMode | null;

export function createAttempt(
  overrides: Partial<Omit<Attempt, 'outcome'>> & {
    outcome?: AnswerOutcome;
    selectedChoiceId?: string;
    sessionMode?: AttemptSessionMode;
  } = {},
): Attempt & { sessionMode?: AttemptSessionMode } {
  const now = new Date();
  const questionId = overrides.questionId ?? createUuid();
  const selectedChoiceId = overrides.selectedChoiceId ?? createUuid();

  const base: Attempt = {
    id: overrides.id ?? createUuid(),
    userId: overrides.userId ?? createUuid(),
    questionId,
    practiceSessionId: overrides.practiceSessionId ?? null,
    outcome: overrides.outcome ?? answeredOutcome(selectedChoiceId),
    isCorrect: overrides.isCorrect ?? false,
    timeSpentSeconds: overrides.timeSpentSeconds ?? 0,
    retryOfAttemptId: overrides.retryOfAttemptId ?? null,
    retryOrigin: overrides.retryOrigin ?? null,
    retrySessionId: overrides.retrySessionId ?? null,
    answeredAt: overrides.answeredAt ?? now,
  };

  return overrides.sessionMode !== undefined
    ? { ...base, sessionMode: overrides.sessionMode }
    : base;
}

export function createBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  const now = new Date();

  return {
    userId: createUuid(),
    questionId: createUuid(),
    createdAt: now,
    ...overrides,
  };
}

export function createQuestionRatingFeedback(
  overrides: Partial<
    Omit<QuestionRatingFeedback, 'kind' | 'category' | 'comment'>
  > = {},
): QuestionRatingFeedback {
  const now = new Date();
  const { rating = 'helpful', ...rest } = overrides;

  return {
    id: createUuid(),
    userId: createUuid(),
    questionId: createUuid(),
    attemptId: null,
    practiceSessionId: null,
    createdAt: now,
    ...rest,
    kind: 'rating',
    rating,
    category: null,
    comment: null,
  };
}

export function createQuestionReportFeedback(
  overrides: Partial<Omit<QuestionReportFeedback, 'kind' | 'rating'>> = {},
): QuestionReportFeedback {
  const now = new Date();
  const { category = 'other', comment = null, ...rest } = overrides;

  return {
    id: createUuid(),
    userId: createUuid(),
    questionId: createUuid(),
    attemptId: null,
    practiceSessionId: null,
    createdAt: now,
    ...rest,
    kind: 'report',
    rating: null,
    category,
    comment,
  };
}

export function createTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: createUuid(),
    slug: 'tag-1',
    name: 'Tag 1',
    kind: 'topic' satisfies TagKind,
    ...overrides,
  };
}

export function createChoice(overrides: Partial<Choice> = {}): Choice {
  return {
    id: createUuid(),
    questionId: createUuid(),
    label: 'A' satisfies ChoiceLabel,
    textMd: 'Choice A',
    isCorrect: false,
    explanationMd: null,
    sortOrder: 1,
    ...overrides,
  };
}

export function createQuestion(overrides: Partial<Question> = {}): Question {
  const now = new Date();
  const question: Question = {
    id: createUuid(),
    slug: 'question-1',
    stemMd: 'Stem',
    explanationMd: 'Explanation',
    referenceMd: null,
    difficulty: 'easy' satisfies QuestionDifficulty,
    status: 'published' satisfies QuestionStatus,
    choices: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };

  return {
    ...question,
    choices: [...question.choices].sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export function createSubscription(
  overrides: Partial<Subscription> = {},
): Subscription {
  const now = new Date();
  return {
    id: createUuid(),
    userId: createUuid(),
    plan: 'monthly' satisfies SubscriptionPlan,
    status: 'active' satisfies SubscriptionStatus,
    currentPeriodEnd: new Date(now.getTime() + DAY_MS),
    cancelAtPeriodEnd: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function createPracticeSession(
  overrides: Partial<Omit<PracticeSession, 'questionStates'>> & {
    questionStates?: readonly (Pick<
      PracticeSessionQuestionState,
      | 'questionId'
      | 'markedForReview'
      | 'latestSelectedChoiceId'
      | 'latestIsCorrect'
      | 'latestAnsweredAt'
    > &
      Partial<
        Pick<
          PracticeSessionQuestionState,
          'draftSelectedChoiceId' | 'draftSavedAt' | 'draftCumulativeMs'
        >
      >)[];
  } = {},
): PracticeSession {
  const questionIds = overrides.questionIds ?? [createUuid()];
  const questionStates =
    overrides.questionStates ??
    questionIds.map((questionId) => ({
      questionId,
      markedForReview: false,
      latestSelectedChoiceId: null,
      latestIsCorrect: null,
      latestAnsweredAt: null,
      draftSelectedChoiceId: null,
      draftSavedAt: null,
      draftCumulativeMs: 0,
    }));
  const normalizedQuestionStates: PracticeSessionQuestionState[] =
    questionStates.map((state) => ({
      questionId: state.questionId,
      markedForReview: state.markedForReview,
      latestSelectedChoiceId: state.latestSelectedChoiceId,
      latestIsCorrect: state.latestIsCorrect,
      latestAnsweredAt: state.latestAnsweredAt,
      draftSelectedChoiceId: state.draftSelectedChoiceId ?? null,
      draftSavedAt: state.draftSavedAt ?? null,
      draftCumulativeMs: state.draftCumulativeMs ?? 0,
    }));

  return {
    id: createUuid(),
    userId: createUuid(),
    mode: 'tutor' satisfies PracticeMode,
    questionIds,
    tagFilters: [],
    difficultyFilters: [],
    startedAt: new Date(),
    endedAt: null,
    ...overrides,
    questionStates: normalizedQuestionStates,
  };
}
