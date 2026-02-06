import type { Attempt } from '../entities/attempt';
import type { Choice } from '../entities/choice';
import type { PracticeSession } from '../entities/practice-session';
import type { Question } from '../entities/question';
import type { Subscription } from '../entities/subscription';
import type { Tag } from '../entities/tag';
import type { User } from '../entities/user';
import type {
  ChoiceLabel,
  PracticeMode,
  QuestionDifficulty,
  QuestionStatus,
  SubscriptionPlan,
  SubscriptionStatus,
  TagKind,
} from '../value-objects';

export function createUser(overrides: Partial<User> = {}): User {
  const now = new Date();
  return {
    id: 'user-1',
    email: 'user@example.com',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function createAttempt(overrides: Partial<Attempt> = {}): Attempt {
  const now = new Date();
  const questionId = overrides.questionId ?? 'question-1';

  return {
    id: overrides.id ?? `attempt-${questionId}`,
    userId: overrides.userId ?? 'user-1',
    questionId,
    practiceSessionId: overrides.practiceSessionId ?? null,
    selectedChoiceId: overrides.selectedChoiceId ?? 'choice-1',
    isCorrect: overrides.isCorrect ?? false,
    timeSpentSeconds: overrides.timeSpentSeconds ?? 0,
    answeredAt: overrides.answeredAt ?? now,
  };
}

export function createTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 'tag-1',
    slug: 'tag-1',
    name: 'Tag 1',
    kind: 'topic' satisfies TagKind,
    ...overrides,
  };
}

export function createChoice(overrides: Partial<Choice> = {}): Choice {
  return {
    id: 'choice-1',
    questionId: 'question-1',
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
    id: 'question-1',
    slug: 'question-1',
    stemMd: 'Stem',
    explanationMd: 'Explanation',
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
    id: 'subscription-1',
    userId: 'user-1',
    plan: 'monthly' satisfies SubscriptionPlan,
    status: 'active' satisfies SubscriptionStatus,
    currentPeriodEnd: new Date(now.getTime() + 86_400_000),
    cancelAtPeriodEnd: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function createPracticeSession(
  overrides: Partial<PracticeSession> = {},
): PracticeSession {
  const questionIds = overrides.questionIds ?? ['question-1'];
  const questionStates =
    overrides.questionStates ??
    questionIds.map((questionId) => ({
      questionId,
      markedForReview: false,
      latestSelectedChoiceId: null,
      latestIsCorrect: null,
      latestAnsweredAt: null,
    }));

  return {
    id: 'session-1',
    userId: 'user-1',
    mode: 'tutor' satisfies PracticeMode,
    questionIds,
    questionStates,
    tagFilters: [],
    difficultyFilters: [],
    startedAt: new Date(),
    endedAt: null,
    ...overrides,
  };
}
