// Fixtures, controller mocks and review builders shared by the
// usePracticeSessionReviewStage browser suites.
import { vi } from 'vitest';
import type { ExamDraftSaveResult } from '@/app/(app)/app/practice/shared/question-flow-actions';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  EndPracticeSessionOutput,
  FinalizeExamAnswersOutput,
  GetCompletedSessionQuestionsWithFeedbackOutput,
  GetPracticeSessionReviewOutput,
  GetPracticeSessionSummaryOutput,
} from '@/src/adapters/controllers/practice-controller';

import type { UsePracticeSessionReviewStageInput } from './use-practice-session-review-stage';

export const fixtureSession1Id = crypto.randomUUID();
export const fixtureQ1Id = crypto.randomUUID();
export const fixtureQ2Id = crypto.randomUUID();

export const endPracticeSessionMock =
  vi.fn<(input: unknown) => Promise<ActionResult<EndPracticeSessionOutput>>>();
export const finalizeExamAnswersMock =
  vi.fn<(input: unknown) => Promise<ActionResult<FinalizeExamAnswersOutput>>>();
export const getPracticeSessionReviewMock =
  vi.fn<
    (input: unknown) => Promise<ActionResult<GetPracticeSessionReviewOutput>>
  >();
export const getPracticeSessionSummaryMock =
  vi.fn<
    (input: unknown) => Promise<ActionResult<GetPracticeSessionSummaryOutput>>
  >();
export const getCompletedSessionQuestionsWithFeedbackMock =
  vi.fn<
    (
      input: unknown,
    ) => Promise<ActionResult<GetCompletedSessionQuestionsWithFeedbackOutput>>
  >();
export const saveCurrentExamDraftMock =
  vi.fn<() => Promise<ExamDraftSaveResult>>();
export const getCurrentExamDraftMock = vi.fn<
  UsePracticeSessionReviewStageInput['getCurrentExamDraft']
>(() => null);

export function createInput(sessionMode: 'tutor' | 'exam') {
  return {
    sessionId: fixtureSession1Id,
    isMounted: () => true,
    sessionInfo: null as UsePracticeSessionReviewStageInput['sessionInfo'],
    questionId: null,
    submitResult: null,
    sessionMode,
    setSessionMode: vi.fn(),
    setLoadState: vi.fn(),
    resetQuestionState: vi.fn(),
    loadSpecificQuestion: vi.fn(),
    endPracticeSessionFn: endPracticeSessionMock,
    finalizeExamAnswersFn: finalizeExamAnswersMock,
    getPracticeSessionReviewFn: getPracticeSessionReviewMock,
    getPracticeSessionSummaryFn: getPracticeSessionSummaryMock,
    getCompletedSessionQuestionsWithFeedbackFn:
      getCompletedSessionQuestionsWithFeedbackMock,
    saveCurrentExamDraft: saveCurrentExamDraftMock,
    getCurrentExamDraft: getCurrentExamDraftMock,
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

type PostExamReviewRowSpec =
  | string
  | GetCompletedSessionQuestionsWithFeedbackOutput['rows'][number];

export function createPostExamReview(
  ...rows: [PostExamReviewRowSpec, ...PostExamReviewRowSpec[]]
): GetCompletedSessionQuestionsWithFeedbackOutput {
  const reviewRows = rows.map((row, index) =>
    typeof row === 'string'
      ? createPostExamReviewRow({
          questionId: row,
          order: index + 1,
        })
      : row,
  );

  return {
    sessionId: fixtureSession1Id,
    mode: 'exam',
    totalCount: reviewRows.length,
    answeredCount: reviewRows.filter((row) => row.isAnswered).length,
    markedCount: reviewRows.filter((row) => row.markedForReview).length,
    rows: reviewRows,
  };
}

export async function flushDeferredSettlement(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}
