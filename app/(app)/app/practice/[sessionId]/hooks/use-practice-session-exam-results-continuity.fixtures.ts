import type {
  EndPracticeSessionOutput,
  GetCompletedSessionQuestionsWithFeedbackOutput,
} from '@/src/adapters/controllers/practice-controller';

export function createSummary(
  input?: Partial<EndPracticeSessionOutput>,
): EndPracticeSessionOutput {
  return {
    sessionId: 'session-1',
    endedAt: '2026-02-07T00:20:00.000Z',
    mode: 'exam',
    questionCount: 3,
    totals: {
      answered: 3,
      correct: 2,
      accuracy: 2 / 3,
      durationSeconds: 180,
    },
    ...input,
  };
}

export function createPostExamReviewRow(input: {
  questionId: string;
  order: number;
  isAvailable?: boolean;
}): GetCompletedSessionQuestionsWithFeedbackOutput['rows'][number] {
  if (input.isAvailable === false) {
    return {
      isAvailable: false,
      questionId: input.questionId,
      order: input.order,
      isAnswered: true,
      isCorrect: false,
      isOmitted: false,
      markedForReview: false,
    };
  }

  return {
    isAvailable: true,
    questionId: input.questionId,
    slug: `${input.questionId}-slug`,
    stemMd: `Stem for ${input.questionId}`,
    difficulty: 'easy',
    order: input.order,
    isAnswered: true,
    isCorrect: true,
    isOmitted: false,
    markedForReview: false,
    choices: [
      { id: `${input.questionId}-choice-1`, label: 'A', textMd: 'Choice A' },
    ],
    selectedChoiceId: `${input.questionId}-choice-1`,
    correctChoiceId: `${input.questionId}-choice-1`,
    explanationMd: `Explanation for ${input.questionId}`,
    referenceMd: null,
    choiceExplanations: [],
  };
}

export function createPostExamReview(
  ...rows: GetCompletedSessionQuestionsWithFeedbackOutput['rows']
): GetCompletedSessionQuestionsWithFeedbackOutput {
  return {
    sessionId: 'session-1',
    mode: 'exam',
    totalCount: rows.length,
    answeredCount: rows.filter((row) => row.isAnswered).length,
    markedCount: rows.filter((row) => row.markedForReview).length,
    rows,
  };
}
