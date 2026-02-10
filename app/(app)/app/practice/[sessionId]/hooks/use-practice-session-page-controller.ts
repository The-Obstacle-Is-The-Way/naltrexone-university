import { useEffect } from 'react';
import { usePracticeSessionQuestionFlow } from '@/app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow';
import { maybeAutoAdvanceAfterSubmit } from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import { usePracticeQuestionBookmarks } from '@/app/(app)/app/practice/hooks/use-practice-question-bookmarks';
import { useIsMounted } from '@/lib/use-is-mounted';
import { setPracticeSessionQuestionMark } from '@/src/adapters/controllers/practice-controller';
import {
  getNextQuestion,
  submitAnswer,
} from '@/src/adapters/controllers/question-controller';
import type { PracticeSessionPageViewProps } from '../components/practice-session-page-view';
import { usePracticeSessionMarkForReview } from './use-practice-session-mark-for-review';
import { usePracticeSessionReviewStage } from './use-practice-session-review-stage';

export function usePracticeSessionPageController(
  sessionId: string,
): PracticeSessionPageViewProps {
  const isMounted = useIsMounted();

  const questionFlow = usePracticeSessionQuestionFlow({
    sessionId,
    isMounted,
    getNextQuestionFn: getNextQuestion,
    submitAnswerFn: submitAnswer,
  });

  const bookmarks = usePracticeQuestionBookmarks({
    question: questionFlow.question,
    isMounted,
  });

  const reviewStage = usePracticeSessionReviewStage({
    sessionId,
    isMounted,
    sessionInfo: questionFlow.sessionInfo,
    questionId: questionFlow.question?.questionId ?? null,
    submitResult: questionFlow.submitResult,
    sessionMode: questionFlow.sessionMode,
    setSessionMode: questionFlow.setSessionMode,
    setLoadState: questionFlow.setLoadState,
    resetQuestionState: questionFlow.resetQuestionState,
    loadSpecificQuestion: questionFlow.onNavigateQuestion,
  });

  useEffect(() => {
    if (reviewStage.isInReviewStage) return;

    maybeAutoAdvanceAfterSubmit({
      mode: questionFlow.sessionMode,
      submitResult: questionFlow.submitResult,
      loadStateStatus: questionFlow.loadState.status,
      advance: questionFlow.onNextQuestion,
    });
  }, [
    reviewStage.isInReviewStage,
    questionFlow.sessionMode,
    questionFlow.submitResult,
    questionFlow.loadState.status,
    questionFlow.onNextQuestion,
  ]);

  const { isMarkingForReview, onToggleMarkForReview } =
    usePracticeSessionMarkForReview({
      question: questionFlow.question,
      sessionMode: questionFlow.sessionMode,
      sessionInfo: questionFlow.sessionInfo,
      sessionId,
      applySessionInfo: questionFlow.applySessionInfo,
      setLoadState: questionFlow.setLoadState,
      setReview: reviewStage.setReview,
      isMounted,
      setPracticeSessionQuestionMarkFn: setPracticeSessionQuestionMark,
    });

  return {
    summary: reviewStage.summary,
    summaryReview: reviewStage.summaryReview,
    summaryReviewLoadState: reviewStage.summaryReviewLoadState,
    review: reviewStage.review,
    reviewLoadState: reviewStage.reviewLoadState,
    navigator: reviewStage.navigator,
    navigatorLoadState: reviewStage.navigatorLoadState,
    sessionInfo: questionFlow.sessionInfo,
    loadState: questionFlow.loadState,
    question: questionFlow.question,
    selectedChoiceId: questionFlow.selectedChoiceId,
    isAnswered: questionFlow.isAnswered,
    submitResult: questionFlow.submitResult,
    isPending: questionFlow.isPending,
    bookmarkStatus: bookmarks.bookmarkStatus,
    isBookmarked: bookmarks.isBookmarked,
    isMarkingForReview,
    bookmarkMessage: bookmarks.bookmarkMessage,
    bookmarkMessageVersion: bookmarks.bookmarkMessageVersion,
    canSubmit: questionFlow.canSubmit,
    onEndSession: reviewStage.onEndSession,
    onRetryReview: reviewStage.onRetryReview,
    onRetryNavigator: reviewStage.onRetryNavigator,
    onTryAgain: questionFlow.onTryAgain,
    onRetryBookmarks: bookmarks.onRetryBookmarks,
    onToggleBookmark: bookmarks.onToggleBookmark,
    onToggleMarkForReview,
    onSelectChoice: questionFlow.onSelectChoice,
    onSubmit: questionFlow.onSubmit,
    onNextQuestion: questionFlow.onNextQuestion,
    onNavigateQuestion: questionFlow.onNavigateQuestion,
    onOpenReviewQuestion: reviewStage.onOpenReviewQuestion,
    onFinalizeReview: reviewStage.onFinalizeReview,
  };
}
