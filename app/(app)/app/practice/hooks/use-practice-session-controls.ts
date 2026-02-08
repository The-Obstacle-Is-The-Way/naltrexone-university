import { useIsMounted } from '@/lib/use-is-mounted';
import type { PracticeSessionStarterProps } from '../components/practice-session-starter';
import type { PracticeFilters } from '../practice-page-logic';
import { usePracticeIncompleteSession } from './use-practice-incomplete-session';
import { usePracticeSessionHistory } from './use-practice-session-history';
import { usePracticeSessionStart } from './use-practice-session-start';
import { usePracticeSessionTags } from './use-practice-session-tags';

export type UsePracticeSessionControlsOutput = {
  filters: PracticeFilters;
  sessionMode: 'tutor' | 'exam';
  sessionCount: number;
  tagLoadStatus: 'idle' | 'loading' | 'error';
  availableTags: ReturnType<typeof usePracticeSessionTags>['availableTags'];
  sessionStartStatus: 'idle' | 'loading' | 'error';
  sessionStartError: string | null;
  incompleteSessionStatus: 'idle' | 'loading' | 'error';
  incompleteSessionError: string | null;
  incompleteSession: ReturnType<
    typeof usePracticeIncompleteSession
  >['incompleteSession'];
  sessionHistoryStatus: ReturnType<
    typeof usePracticeSessionHistory
  >['sessionHistoryStatus'];
  sessionHistoryError: ReturnType<
    typeof usePracticeSessionHistory
  >['sessionHistoryError'];
  sessionHistoryRows: ReturnType<
    typeof usePracticeSessionHistory
  >['sessionHistoryRows'];
  selectedHistorySessionId: ReturnType<
    typeof usePracticeSessionHistory
  >['selectedHistorySessionId'];
  selectedHistoryReview: ReturnType<
    typeof usePracticeSessionHistory
  >['selectedHistoryReview'];
  historyReviewLoadState: ReturnType<
    typeof usePracticeSessionHistory
  >['historyReviewLoadState'];
  onSessionModeChange: PracticeSessionStarterProps['onSessionModeChange'];
  onSessionCountChange: PracticeSessionStarterProps['onSessionCountChange'];
  onToggleTag: PracticeSessionStarterProps['onToggleTag'];
  onToggleDifficulty: PracticeSessionStarterProps['onToggleDifficulty'];
  onStartSession: () => Promise<void>;
  onAbandonIncompleteSession: () => Promise<void>;
  onOpenSessionHistory: (sessionId: string) => Promise<void>;
};

export function usePracticeSessionControls(): UsePracticeSessionControlsOutput {
  const isMounted = useIsMounted();
  const sessionStart = usePracticeSessionStart({ isMounted });
  const tags = usePracticeSessionTags();
  const incomplete = usePracticeIncompleteSession({ isMounted });
  const sessionHistory = usePracticeSessionHistory();

  return {
    filters: sessionStart.filters,
    sessionMode: sessionStart.sessionMode,
    sessionCount: sessionStart.sessionCount,
    tagLoadStatus: tags.tagLoadStatus,
    availableTags: tags.availableTags,
    sessionStartStatus: sessionStart.sessionStartStatus,
    sessionStartError: sessionStart.sessionStartError,
    incompleteSessionStatus: incomplete.incompleteSessionStatus,
    incompleteSessionError: incomplete.incompleteSessionError,
    incompleteSession: incomplete.incompleteSession,
    sessionHistoryStatus: sessionHistory.sessionHistoryStatus,
    sessionHistoryError: sessionHistory.sessionHistoryError,
    sessionHistoryRows: sessionHistory.sessionHistoryRows,
    selectedHistorySessionId: sessionHistory.selectedHistorySessionId,
    selectedHistoryReview: sessionHistory.selectedHistoryReview,
    historyReviewLoadState: sessionHistory.historyReviewLoadState,
    onSessionModeChange: sessionStart.onSessionModeChange,
    onSessionCountChange: sessionStart.onSessionCountChange,
    onToggleTag: sessionStart.onToggleTag,
    onToggleDifficulty: sessionStart.onToggleDifficulty,
    onStartSession: sessionStart.onStartSession,
    onAbandonIncompleteSession: incomplete.onAbandonIncompleteSession,
    onOpenSessionHistory: sessionHistory.onOpenSessionHistory,
  };
}
