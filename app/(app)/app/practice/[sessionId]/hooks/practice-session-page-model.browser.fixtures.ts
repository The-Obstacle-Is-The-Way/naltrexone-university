type PracticeMode = 'tutor' | 'exam';
type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export const BROWSER_SESSION_ID = crypto.randomUUID();
export const BROWSER_QUESTION_1_ID = crypto.randomUUID();
export const BROWSER_QUESTION_2_ID = crypto.randomUUID();
export const BROWSER_QUESTION_3_ID = crypto.randomUUID();
export const BROWSER_CHOICE_1_ID = crypto.randomUUID();
export const BROWSER_CHOICE_2_ID = crypto.randomUUID();
export const BROWSER_CHOICE_3_ID = crypto.randomUUID();
export const BROWSER_ATTEMPT_1_ID = crypto.randomUUID();

type ChoiceFixture = {
  id: string;
  label: string;
  textMd: string;
  sortOrder: number;
};

type PreviousSubmissionChoiceExplanation = {
  choiceId: string;
  displayLabel: string;
  textMd: string;
  isCorrect: boolean;
  explanationMd: string | null;
};

type PreviousSubmissionFixture = {
  correctChoiceId: string | null;
  explanationMd: string | null;
  choiceExplanations: PreviousSubmissionChoiceExplanation[];
};

type QuestionSessionFixture = {
  sessionId?: string;
  mode: PracticeMode;
  deadlineAt?: string | null;
  index: number;
  total: number;
  isMarkedForReview: boolean;
  latestSelectedChoiceId?: string | null;
  latestIsCorrect?: boolean | null;
  previousSubmission?: PreviousSubmissionFixture;
};

type QuestionFixtureInput = {
  questionId: string;
  slug?: string;
  stemMd?: string;
  difficulty?: QuestionDifficulty;
  choices?: ChoiceFixture[];
  session: QuestionSessionFixture;
};

type ReviewRowFixtureInput = {
  questionId: string;
  order: number;
  slug?: string;
  stemMd?: string;
  difficulty?: QuestionDifficulty;
  isAvailable?: boolean;
  isAnswered?: boolean;
  isCorrect?: boolean | null;
  isOmitted?: boolean;
  markedForReview?: boolean;
};

type ReviewFixtureInput = {
  sessionId?: string;
  mode: PracticeMode;
  totalCount: number;
  answeredCount: number;
  markedCount: number;
  rows?: ReturnType<typeof createReviewRow>[];
};

export function createChoice(input: {
  id: string;
  label?: string;
  textMd?: string;
  sortOrder?: number;
}): ChoiceFixture {
  const label = input.label ?? 'A';

  return {
    id: input.id,
    label,
    textMd: input.textMd ?? `Option ${label}`,
    sortOrder: input.sortOrder ?? 1,
  };
}

export function createQuestionResponse(input: QuestionFixtureInput) {
  return {
    questionId: input.questionId,
    slug: input.slug ?? input.questionId,
    stemMd: input.stemMd ?? `Question ${input.questionId}`,
    difficulty: input.difficulty ?? 'easy',
    choices: input.choices ?? [createChoice({ id: BROWSER_CHOICE_1_ID })],
    session: {
      sessionId: input.session.sessionId ?? BROWSER_SESSION_ID,
      mode: input.session.mode,
      deadlineAt:
        input.session.deadlineAt !== undefined
          ? input.session.deadlineAt
          : input.session.mode === 'exam'
            ? '2099-05-22T12:02:24.000Z'
            : null,
      index: input.session.index,
      total: input.session.total,
      isMarkedForReview: input.session.isMarkedForReview,
      ...(input.session.latestSelectedChoiceId !== undefined
        ? { latestSelectedChoiceId: input.session.latestSelectedChoiceId }
        : {}),
      ...(input.session.latestIsCorrect !== undefined
        ? { latestIsCorrect: input.session.latestIsCorrect }
        : {}),
      ...(input.session.previousSubmission !== undefined
        ? { previousSubmission: input.session.previousSubmission }
        : {}),
    },
  };
}

export function createReviewRow(input: ReviewRowFixtureInput) {
  return {
    isAvailable: input.isAvailable ?? true,
    questionId: input.questionId,
    slug: input.slug ?? input.questionId,
    order: input.order,
    stemMd: input.stemMd ?? `Question ${input.order}`,
    difficulty: input.difficulty ?? 'easy',
    isAnswered: input.isAnswered ?? false,
    isCorrect: input.isCorrect ?? null,
    isOmitted: input.isOmitted ?? false,
    markedForReview: input.markedForReview ?? false,
  };
}

export function createReviewResponse(input: ReviewFixtureInput) {
  return {
    sessionId: input.sessionId ?? BROWSER_SESSION_ID,
    mode: input.mode,
    totalCount: input.totalCount,
    answeredCount: input.answeredCount,
    markedCount: input.markedCount,
    rows: input.rows ?? [],
  };
}
