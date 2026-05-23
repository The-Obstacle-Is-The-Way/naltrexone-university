import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePracticeSessionQuestionFlow } from '@/app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow';
import { ExamTimer } from '@/app/(app)/app/practice/components/exam-timer';
import { usePracticeQuestionBookmarks } from '@/app/(app)/app/practice/hooks/use-practice-question-bookmarks';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/shared/error-message-helpers';
import { STANDARD_READ_TIMEOUT_MS } from '@/app/(app)/app/shared/timeout-tiers';
import { reportClientError } from '@/lib/report-client-error';
import { useIsMounted } from '@/lib/use-is-mounted';
import { withTimeout } from '@/lib/with-timeout';
import {
  endPracticeSession,
  finalizeExamAnswers,
  getCompletedSessionQuestionsWithFeedback,
  getPracticeSessionReview,
  getPracticeSessionSummary,
  saveExamDraftAnswer,
  setPracticeSessionQuestionMark,
} from '@/src/adapters/controllers/practice-controller';
import {
  getNextQuestion,
  submitAnswer,
} from '@/src/adapters/controllers/question-controller';
import type { PracticeSessionPageViewProps } from '../components/practice-session-page-view';
import { useExamTimer } from './use-exam-timer';
import { usePracticeSessionMarkForReview } from './use-practice-session-mark-for-review';
import { usePracticeSessionReviewStage } from './use-practice-session-review-stage';

const BOOTSTRAP_SUMMARY_TIMEOUT_MS = STANDARD_READ_TIMEOUT_MS;

type PracticeSessionPageControllerOutput = PracticeSessionPageViewProps & {
  canSubmit: boolean;
  onSubmit: () => void;
};

export function usePracticeSessionPageController(
  sessionId: string,
): PracticeSessionPageControllerOutput {
  const isMounted = useIsMounted();
  const bootstrapRequestIdRef = useRef(0);
  const expiryFinalizeInFlightRef = useRef(false);
  const [shouldRetryBootstrap, setShouldRetryBootstrap] = useState(false);

  const questionFlow = usePracticeSessionQuestionFlow({
    sessionId,
    autoload: false,
    isMounted,
    getNextQuestionFn: getNextQuestion,
    submitAnswerFn: submitAnswer,
    saveExamDraftAnswerFn: saveExamDraftAnswer,
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
    endPracticeSessionFn: endPracticeSession,
    finalizeExamAnswersFn: finalizeExamAnswers,
    getPracticeSessionReviewFn: getPracticeSessionReview,
    getCompletedSessionQuestionsWithFeedbackFn:
      getCompletedSessionQuestionsWithFeedback,
    getPracticeSessionSummaryFn: getPracticeSessionSummary,
    saveCurrentExamDraft: questionFlow.saveCurrentExamDraft,
  });

  const currentPostExamBookmarkQuestion = useMemo(() => {
    const currentRow =
      reviewStage.postExamReview?.rows.find(
        (row) => row.questionId === reviewStage.postExamReviewCurrentQuestionId,
      ) ??
      reviewStage.postExamReview?.rows[0] ??
      null;

    if (!currentRow?.isAvailable) return null;
    return { questionId: currentRow.questionId };
  }, [reviewStage.postExamReview, reviewStage.postExamReviewCurrentQuestionId]);

  const bookmarks = usePracticeQuestionBookmarks({
    question: currentPostExamBookmarkQuestion ?? questionFlow.question,
    isMounted,
  });

  const finalizeExpiredExam = useCallback(() => {
    if (expiryFinalizeInFlightRef.current) return;
    expiryFinalizeInFlightRef.current = true;

    void (async () => {
      try {
        await questionFlow.saveCurrentExamDraft();
      } catch (error) {
        if (isMounted()) {
          reportClientError(error, {
            component: 'UsePracticeSessionPageController',
            action: 'saveCurrentExamDraftOnTimerExpire',
          });
        }
      }

      if (!isMounted()) return;
      await reviewStage.finalizeExamSession();
    })();
  }, [
    isMounted,
    questionFlow.saveCurrentExamDraft,
    reviewStage.finalizeExamSession,
  ]);

  const isTimerActive =
    questionFlow.sessionMode === 'exam' &&
    typeof questionFlow.sessionInfo?.deadlineAt === 'string' &&
    !reviewStage.summary &&
    !reviewStage.review &&
    !reviewStage.postExamSummary &&
    !reviewStage.postExamReview;
  const timerState = useExamTimer({
    deadlineAt: questionFlow.sessionInfo?.deadlineAt ?? null,
    isExamActive: isTimerActive,
    onExpire: finalizeExpiredExam,
  });
  const examTimer = timerState
    ? createElement(ExamTimer, {
        remainingSeconds: timerState.remainingSeconds,
        isExpired: timerState.isExpired,
      })
    : undefined;

  const bootstrapSessionSummary = useCallback(() => {
    const requestId = bootstrapRequestIdRef.current + 1;
    bootstrapRequestIdRef.current = requestId;
    reviewStage.setSummary(null);
    setShouldRetryBootstrap(false);
    questionFlow.setLoadState({ status: 'loading' });

    void withTimeout(
      getPracticeSessionSummary({ sessionId }),
      BOOTSTRAP_SUMMARY_TIMEOUT_MS,
    )
      .then((result) => {
        if (requestId !== bootstrapRequestIdRef.current || !isMounted()) return;

        if (result.ok) {
          reviewStage.setSummary(result.data);
          questionFlow.setSessionMode(result.data.mode);
          questionFlow.resetQuestionState();
          questionFlow.setLoadState({ status: 'ready' });
          return;
        }

        if (result.error.code === 'CONFLICT') {
          questionFlow.onTryAgain();
          return;
        }

        setShouldRetryBootstrap(true);
        questionFlow.setLoadState({
          status: 'error',
          message: getActionResultErrorMessage(result),
        });
      })
      .catch((error: unknown) => {
        if (requestId !== bootstrapRequestIdRef.current || !isMounted()) return;
        reportClientError(error, {
          component: 'UsePracticeSessionPageController',
          action: 'bootstrapSessionSummary',
        });
        setShouldRetryBootstrap(true);
        questionFlow.setLoadState({
          status: 'error',
          message: getThrownErrorMessage(error),
        });
      });
  }, [
    sessionId,
    isMounted,
    questionFlow.onTryAgain,
    questionFlow.resetQuestionState,
    questionFlow.setLoadState,
    questionFlow.setSessionMode,
    reviewStage.setSummary,
  ]);

  useEffect(() => {
    bootstrapSessionSummary();
    return () => {
      bootstrapRequestIdRef.current += 1;
    };
  }, [bootstrapSessionSummary]);

  const onTryAgain = useCallback(() => {
    if (shouldRetryBootstrap) {
      bootstrapSessionSummary();
      return;
    }

    questionFlow.onTryAgain();
  }, [bootstrapSessionSummary, questionFlow.onTryAgain, shouldRetryBootstrap]);
  const onSubmit = useCallback((): void => {
    void questionFlow.onSubmit({
      allowExamCommit: reviewStage.isReviewQuestionActive,
    });
  }, [questionFlow.onSubmit, reviewStage.isReviewQuestionActive]);

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
    postExamSummary: reviewStage.postExamSummary,
    examResultsSubstage: reviewStage.examResultsSubstage,
    postExamReview: reviewStage.postExamReview,
    postExamReviewLoadState: reviewStage.postExamReviewLoadState,
    postExamReviewCurrentQuestionId:
      reviewStage.postExamReviewCurrentQuestionId,
    summaryReview: reviewStage.summaryReview,
    summaryReviewLoadState: reviewStage.summaryReviewLoadState,
    review: reviewStage.review,
    reviewLoadState: reviewStage.reviewLoadState,
    navigator: reviewStage.navigator,
    navigatorLoadState: reviewStage.navigatorLoadState,
    examTimer,
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
    onRetryPostExamReview: reviewStage.onRetryPostExamReview,
    onRetryNavigator: reviewStage.onRetryNavigator,
    onTryAgain,
    onRetryBookmarks: bookmarks.onRetryBookmarks,
    onToggleBookmark: bookmarks.onToggleBookmark,
    onToggleMarkForReview,
    onSelectChoice: questionFlow.onSelectChoice,
    onSubmit,
    onNextQuestion: questionFlow.onNextQuestion,
    onNavigateQuestion: questionFlow.onNavigateQuestion,
    onOpenReviewQuestion: reviewStage.onOpenReviewQuestion,
    onNavigatePostExamReviewQuestion:
      reviewStage.onNavigatePostExamReviewQuestion,
    onReenterPostExamReview: reviewStage.onReenterPostExamReview,
    onViewSummary: reviewStage.onViewSummary,
    onFinalizeReview: reviewStage.onFinalizeReview,
  };
}
