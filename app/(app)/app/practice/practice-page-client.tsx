'use client';

import Link from 'next/link';
import { ErrorCard } from '@/components/error-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ROUTES } from '@/lib/routes';
import {
  IncompleteSessionCard,
  PracticeSessionHistoryPanel,
  PracticeSessionStarter,
} from './components';
import { fireAndForget, logUnhandledAsyncError } from './fire-and-forget';
import { usePracticeSessionControls } from './hooks/use-practice-session-controls';

export default function PracticePageClient() {
  const sessionControls = usePracticeSessionControls();
  const shouldShowSessionStarter =
    sessionControls.incompleteSessionStatus !== 'loading' &&
    sessionControls.incompleteSessionStatus !== 'error' &&
    !sessionControls.incompleteSession;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
              Practice
            </h1>
            <p className="mt-1 text-muted-foreground">
              Choose how you want to practice.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              asChild
              variant="link"
              className="h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline"
            >
              <Link href={ROUTES.APP_DASHBOARD}>Back to Dashboard</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {sessionControls.incompleteSession ? (
          <IncompleteSessionCard
            session={sessionControls.incompleteSession}
            isPending={sessionControls.incompleteSessionStatus === 'loading'}
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

        {shouldShowSessionStarter ? (
          <PracticeSessionStarter
            sessionMode={sessionControls.sessionMode}
            sessionCount={sessionControls.sessionCount}
            filters={sessionControls.filters}
            tagLoadStatus={sessionControls.tagLoadStatus}
            availableTags={sessionControls.availableTags}
            sessionStartStatus={sessionControls.sessionStartStatus}
            sessionStartError={sessionControls.sessionStartError}
            isPending={false}
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
        ) : (
          <Card className="gap-0 rounded-2xl border-border p-6">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">
                Start a session
              </div>
              <div className="text-sm text-muted-foreground">
                {sessionControls.incompleteSession
                  ? 'Resume or abandon your current session to start a new one.'
                  : sessionControls.incompleteSessionStatus === 'error'
                    ? 'Unable to load session status.'
                    : 'Loading session status…'}
              </div>
            </div>
          </Card>
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
    </div>
  );
}
