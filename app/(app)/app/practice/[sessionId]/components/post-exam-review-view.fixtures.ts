import type {
  EndPracticeSessionOutput,
  GetCompletedSessionQuestionsWithFeedbackOutput,
} from '@/src/adapters/controllers/practice-controller';

type ReviewRow = GetCompletedSessionQuestionsWithFeedbackOutput['rows'][number];

export function createSummary(
  overrides?: Partial<EndPracticeSessionOutput>,
): EndPracticeSessionOutput {
  return {
    sessionId: 'session-1',
    mode: 'exam',
    questionCount: 1,
    endedAt: '2026-03-20T00:00:00.000Z',
    totals: {
      answered: 1,
      correct: 0,
      accuracy: 0,
      durationSeconds: 120,
    },
    ...overrides,
  };
}

export function createReviewRow(overrides?: Partial<ReviewRow>): ReviewRow {
  return {
    isAvailable: true,
    questionId: 'question-1',
    slug: 'question-1',
    stemMd: 'Question stem',
    difficulty: 'easy',
    order: 1,
    isAnswered: false,
    isCorrect: null,
    isOmitted: false,
    markedForReview: false,
    choices: [
      { id: 'choice-a', label: 'A', textMd: 'Choice A' },
      { id: 'choice-b', label: 'B', textMd: 'Choice B' },
    ],
    selectedChoiceId: null,
    correctChoiceId: 'choice-b',
    explanationMd: 'Explanation for review.',
    referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
    choiceExplanations: [
      {
        choiceId: 'choice-a',
        displayLabel: 'A',
        textMd: 'Choice A',
        isCorrect: false,
        explanationMd: 'Choice A is incorrect.',
      },
      {
        choiceId: 'choice-b',
        displayLabel: 'B',
        textMd: 'Choice B',
        isCorrect: true,
        explanationMd: 'Choice B is correct.',
      },
    ],
    ...overrides,
  };
}

export function createReview(
  rows: ReviewRow[],
  overrides?: Partial<
    Omit<GetCompletedSessionQuestionsWithFeedbackOutput, 'rows'>
  >,
): GetCompletedSessionQuestionsWithFeedbackOutput {
  return {
    sessionId: 'session-1',
    mode: 'exam',
    totalCount: rows.length,
    answeredCount: rows.filter((r) => r.isAnswered).length,
    markedCount: rows.filter((r) => r.markedForReview).length,
    rows,
    ...overrides,
  };
}
