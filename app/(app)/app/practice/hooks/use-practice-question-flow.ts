import { useIsMounted } from '@/lib/use-is-mounted';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import type { PracticeFilters } from '../practice-page-logic';
import {
  getFocusRecoveryTransition,
  usePracticeQuestionAnswerFlow,
} from './use-practice-question-answer-flow';
import { usePracticeQuestionBookmarks } from './use-practice-question-bookmarks';

export type UsePracticeQuestionFlowInput = {
  filters: PracticeFilters;
};

export type UsePracticeQuestionFlowOutput = {
  question: NextQuestion | null;
  selectedChoiceId: string | null;
  submitResult: SubmitAnswerOutput | null;
  loadState: ReturnType<typeof usePracticeQuestionAnswerFlow>['loadState'];
  isPending: boolean;
  bookmarkStatus: 'idle' | 'loading' | 'error';
  bookmarkMessage: string | null;
  bookmarkMessageVersion: number;
  canSubmit: boolean;
  isBookmarked: boolean;
  questionAreaRef: React.RefObject<HTMLDivElement | null>;
  onTryAgain: () => void;
  onToggleBookmark: () => Promise<void>;
  onSelectChoice: (choiceId: string) => void;
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
  });

  const bookmarks = usePracticeQuestionBookmarks({
    question: answerFlow.question,
    isMounted,
  });

  return {
    ...answerFlow,
    ...bookmarks,
  };
}
