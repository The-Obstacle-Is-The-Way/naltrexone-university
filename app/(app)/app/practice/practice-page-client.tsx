'use client';

import { ErrorCard } from '@/components/error-card';
import {
  IncompleteSessionCard,
  PracticeSessionHistoryPanel,
  PracticeSessionStarter,
  PracticeView,
} from './components';
import { fireAndForget, logUnhandledAsyncError } from './fire-and-forget';
import { usePracticeQuestionFlow } from './hooks/use-practice-question-flow';
import { usePracticeSessionControls } from './hooks/use-practice-session-controls';

export default function PracticePageClient() {
  const sessionControls = usePracticeSessionControls();
  const questionFlow = usePracticeQuestionFlow({
    filters: sessionControls.filters,
  });

  return (
    <PracticeView
      topContent={
        <div className="space-y-4">
          {sessionControls.incompleteSession ? (
            <IncompleteSessionCard
              session={sessionControls.incompleteSession}
              isPending={
                questionFlow.isPending ||
                sessionControls.incompleteSessionStatus === 'loading'
              }
              onAbandon={() => {
                fireAndForget(
                  sessionControls.onAbandonIncompleteSession(),
                  logUnhandledAsyncError,
                );
              }}
            />
          ) : null}
          {sessionControls.incompleteSessionStatus === 'error' &&
          sessionControls.incompleteSessionError ? (
            <ErrorCard>{sessionControls.incompleteSessionError}</ErrorCard>
          ) : null}
          {sessionControls.incompleteSessionStatus !== 'loading' &&
            sessionControls.incompleteSessionStatus !== 'error' &&
            !sessionControls.incompleteSession && (
              <PracticeSessionStarter
                sessionMode={sessionControls.sessionMode}
                sessionCount={sessionControls.sessionCount}
                filters={sessionControls.filters}
                tagLoadStatus={sessionControls.tagLoadStatus}
                availableTags={sessionControls.availableTags}
                sessionStartStatus={sessionControls.sessionStartStatus}
                sessionStartError={sessionControls.sessionStartError}
                isPending={questionFlow.isPending}
                onToggleDifficulty={sessionControls.onToggleDifficulty}
                onToggleTag={sessionControls.onToggleTag}
                onSessionModeChange={sessionControls.onSessionModeChange}
                onSessionCountChange={sessionControls.onSessionCountChange}
                onStartSession={() => {
                  fireAndForget(
                    sessionControls.onStartSession(),
                    logUnhandledAsyncError,
                  );
                }}
              />
            )}
          <PracticeSessionHistoryPanel
            status={sessionControls.sessionHistoryStatus}
            error={sessionControls.sessionHistoryError}
            rows={sessionControls.sessionHistoryRows}
            selectedSessionId={sessionControls.selectedHistorySessionId}
            selectedReview={sessionControls.selectedHistoryReview}
            reviewStatus={sessionControls.historyReviewLoadState}
            onOpenSession={(sessionId) => {
              fireAndForget(
                sessionControls.onOpenSessionHistory(sessionId),
                logUnhandledAsyncError,
              );
            }}
          />
        </div>
      }
      questionAreaRef={questionFlow.questionAreaRef}
      loadState={questionFlow.loadState}
      question={questionFlow.question}
      selectedChoiceId={questionFlow.selectedChoiceId}
      submitResult={questionFlow.submitResult}
      isPending={questionFlow.isPending}
      bookmarkStatus={questionFlow.bookmarkStatus}
      isBookmarked={questionFlow.isBookmarked}
      // Mark-for-review is session-only; ad-hoc practice doesn't support it yet.
      isMarkingForReview={false}
      bookmarkMessage={questionFlow.bookmarkMessage}
      bookmarkMessageVersion={questionFlow.bookmarkMessageVersion}
      canSubmit={questionFlow.canSubmit}
      onTryAgain={questionFlow.onTryAgain}
      onToggleBookmark={() => {
        fireAndForget(questionFlow.onToggleBookmark(), logUnhandledAsyncError);
      }}
      onSelectChoice={questionFlow.onSelectChoice}
      onSubmit={() => {
        fireAndForget(questionFlow.onSubmit(), logUnhandledAsyncError);
      }}
      onNextQuestion={questionFlow.onNextQuestion}
    />
  );
}
