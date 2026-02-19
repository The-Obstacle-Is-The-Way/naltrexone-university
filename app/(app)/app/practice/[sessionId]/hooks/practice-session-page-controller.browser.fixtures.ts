type PracticeMode = 'tutor' | 'exam';
type QuestionDifficulty = 'easy' | 'medium' | 'hard';

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
    choices: input.choices ?? [createChoice({ id: 'choice_1' })],
    session: {
      sessionId: input.session.sessionId ?? 'session-1',
      mode: input.session.mode,
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
    markedForReview: input.markedForReview ?? false,
  };
}

export function createReviewResponse(input: ReviewFixtureInput) {
  return {
    sessionId: input.sessionId ?? 'session-1',
    mode: input.mode,
    totalCount: input.totalCount,
    answeredCount: input.answeredCount,
    markedCount: input.markedCount,
    rows: input.rows ?? [],
  };
}
