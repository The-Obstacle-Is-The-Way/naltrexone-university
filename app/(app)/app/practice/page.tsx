'use client';

import { IncompleteSessionCard } from './components/incomplete-session-card';
import {
  PracticeSessionHistoryPanel,
  type PracticeSessionHistoryPanelProps,
} from './components/practice-session-history-panel';
import {
  PracticeSessionStarter,
  type PracticeSessionStarterProps,
} from './components/practice-session-starter';
import {
  PracticeView,
  type PracticeViewProps,
} from './components/practice-view';
import { fireAndForget } from './fire-and-forget';
import { usePracticeQuestionFlow } from './hooks/use-practice-question-flow';
import { usePracticeSessionControls } from './hooks/use-practice-session-controls';

export {
  IncompleteSessionCard,
  PracticeSessionHistoryPanel,
  PracticeSessionStarter,
  PracticeView,
};
export type {
  PracticeSessionHistoryPanelProps,
  PracticeSessionStarterProps,
  PracticeViewProps,
};

export default function PracticePage() {
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
                fireAndForget(sessionControls.onAbandonIncompleteSession());
              }}
            />
          ) : null}
          {sessionControls.incompleteSessionStatus === 'error' &&
          sessionControls.incompleteSessionError ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {sessionControls.incompleteSessionError}
            </div>
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
                  fireAndForget(sessionControls.onStartSession());
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
              fireAndForget(sessionControls.onOpenSessionHistory(sessionId));
            }}
          />
        </div>
      }
      loadState={questionFlow.loadState}
      question={questionFlow.question}
      selectedChoiceId={questionFlow.selectedChoiceId}
      submitResult={questionFlow.submitResult}
      isPending={questionFlow.isPending}
      bookmarkStatus={questionFlow.bookmarkStatus}
      isBookmarked={questionFlow.isBookmarked}
      isMarkingForReview={false}
      bookmarkMessage={questionFlow.bookmarkMessage}
      canSubmit={questionFlow.canSubmit}
      onTryAgain={questionFlow.onTryAgain}
      onToggleBookmark={() => {
        fireAndForget(questionFlow.onToggleBookmark());
      }}
      onSelectChoice={questionFlow.onSelectChoice}
      onSubmit={() => {
        fireAndForget(questionFlow.onSubmit());
      }}
      onNextQuestion={questionFlow.onNextQuestion}
    />
  );
}
