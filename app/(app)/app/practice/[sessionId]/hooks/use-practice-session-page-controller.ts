import { useEffect } from 'react';
import { usePracticeSessionQuestionFlow } from '@/app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow';
import { maybeAutoAdvanceAfterSubmit } from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import { usePracticeQuestionBookmarks } from '@/app/(app)/app/practice/hooks/use-practice-question-bookmarks';
import { useIsMounted } from '@/lib/use-is-mounted';
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
    setQuestion: questionFlow.setQuestion,
    setSubmitResult: questionFlow.setSubmitResult,
    setSelectedChoiceId: questionFlow.setSelectedChoiceId,
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
      setSessionInfo: questionFlow.setSessionInfo,
      setLoadState: questionFlow.setLoadState,
      setReview: reviewStage.setReview,
      isMounted,
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
