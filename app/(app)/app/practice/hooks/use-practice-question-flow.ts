import {
  getFocusRecoveryTransition,
  usePracticeQuestionAnswerFlow,
} from '@/app/(app)/app/practice/hooks/use-practice-question-answer-flow';
import { usePracticeQuestionBookmarks } from '@/app/(app)/app/practice/hooks/use-practice-question-bookmarks';
import {
  type UsePracticeQuestionFeedbackOutput,
  usePracticeQuestionFeedback,
} from '@/app/(app)/app/practice/hooks/use-practice-question-feedback';
import type { PracticeFilters } from '@/app/(app)/app/practice/practice-page-logic';
import { useIsMounted } from '@/lib/use-is-mounted';
import {
  getNextQuestion,
  submitAnswer,
} from '@/src/adapters/controllers/question-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export type UsePracticeQuestionFlowInput = {
  filters: PracticeFilters;
  onQuestionProgressChanged?: (() => void) | undefined;
};

export type UsePracticeQuestionFlowOutput = {
  question: NextQuestion | null;
  selectedChoiceId: string | null;
  isAnswered: boolean;
  submitResult: SubmitAnswerOutput | null;
  loadState: ReturnType<typeof usePracticeQuestionAnswerFlow>['loadState'];
  isPending: boolean;
  bookmarkStatus: 'idle' | 'loading' | 'error';
  bookmarkMessage: string | null;
  bookmarkMessageVersion: number;
  questionFeedback: UsePracticeQuestionFeedbackOutput;
  canSubmit: boolean;
  isBookmarked: boolean;
  questionAreaRef: React.RefObject<HTMLElement | null>;
  onTryAgain: () => void;
  onRetryBookmarks: () => void;
  onToggleBookmark: () => Promise<void>;
  onSelectChoice: ReturnType<
    typeof usePracticeQuestionAnswerFlow
  >['onSelectChoice'];
  onSubmit: () => Promise<void>;
  onNextQuestion: () => void;
};

export { getFocusRecoveryTransition };

export function usePracticeQuestionFlow(
  input: UsePracticeQuestionFlowInput,
): UsePracticeQuestionFlowOutput {
  const isMounted = useIsMounted();

  const answerFlow = usePracticeQuestionAnswerFlow({
    filters: input.filters,
    isMounted,
    getNextQuestionFn: getNextQuestion,
    submitAnswerFn: submitAnswer,
    onQuestionAnswered: input.onQuestionProgressChanged,
  });

  const bookmarks = usePracticeQuestionBookmarks({
    question: answerFlow.question,
    isMounted,
    onBookmarkToggled: input.onQuestionProgressChanged,
  });
  const questionFeedback = usePracticeQuestionFeedback({
    question: answerFlow.question
      ? {
          questionId: answerFlow.question.questionId,
          attemptId: answerFlow.submitResult?.attemptId ?? null,
          practiceSessionId: null,
        }
      : null,
    isReviewMode:
      answerFlow.submitResult !== null &&
      typeof answerFlow.submitResult.isCorrect === 'boolean',
    isMounted,
  });

  return {
    ...answerFlow,
    ...bookmarks,
    questionFeedback,
  };
}
