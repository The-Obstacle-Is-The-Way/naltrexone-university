import { useCallback } from 'react';
import { useIsMounted } from '@/lib/use-is-mounted';
import type { PracticeSessionStarterProps } from '../components/practice-session-starter';
import type { PracticeFilters } from '../practice-page-logic';
import { usePracticeAvailableQuestionsCount } from './use-practice-available-questions-count';
import { usePracticeIncompleteSession } from './use-practice-incomplete-session';
import { usePracticeSessionStart } from './use-practice-session-start';
import { usePracticeSessionTags } from './use-practice-session-tags';

export type UsePracticeSessionControlsOutput = {
  filters: PracticeFilters;
  sessionMode: 'tutor' | 'exam';
  sessionCount: number;
  sessionCountInputValue: string;
  availableCountStatus: 'idle' | 'loading' | 'error';
  availableCount: number | null;
  tagLoadStatus: 'idle' | 'loading' | 'error';
  availableTags: ReturnType<typeof usePracticeSessionTags>['availableTags'];
  sessionStartStatus: 'idle' | 'loading' | 'error';
  sessionStartError: string | null;
  incompleteSessionStatus: 'idle' | 'loading' | 'error';
  incompleteSessionError: string | null;
  incompleteSession: ReturnType<
    typeof usePracticeIncompleteSession
  >['incompleteSession'];
  onSessionModeChange: PracticeSessionStarterProps['onSessionModeChange'];
  onSessionCountChange: PracticeSessionStarterProps['onSessionCountChange'];
  onSessionCountBlur: NonNullable<
    PracticeSessionStarterProps['onSessionCountBlur']
  >;
  onToggleTag: PracticeSessionStarterProps['onToggleTag'];
  onDifficultyChange: PracticeSessionStarterProps['onDifficultyChange'];
  onStatusChange: PracticeSessionStarterProps['onStatusChange'];
  onStartSession: () => Promise<void>;
  onAbandonIncompleteSession: () => Promise<void>;
};

export function usePracticeSessionControls(): UsePracticeSessionControlsOutput {
  const isMounted = useIsMounted();
  const incomplete = usePracticeIncompleteSession({ isMounted });
  const sessionStart = usePracticeSessionStart({
    isMounted,
    refreshIncompleteSession: incomplete.refreshIncompleteSession,
  });
  const availableCount = usePracticeAvailableQuestionsCount({
    filters: sessionStart.filters,
  });
  const tags = usePracticeSessionTags();

  const incompleteOnAbandon = incomplete.onAbandonIncompleteSession;
  const captureStartIdempotencyKeyRetirement =
    sessionStart.captureIdempotencyKeyRetirement;
  const onAbandonIncompleteSession = useCallback(async () => {
    const retireStartKeyIfUnchanged = captureStartIdempotencyKeyRetirement();
    const recoveryResolved = await incompleteOnAbandon();
    // Local success or an authoritative refresh proving absence consumes the
    // recovery lifecycle that the preserved start key refers to. A failed or
    // indeterminate refresh leaves the key untouched, as does a newer start
    // intent that arrived while recovery was pending.
    if (recoveryResolved) retireStartKeyIfUnchanged();
  }, [captureStartIdempotencyKeyRetirement, incompleteOnAbandon]);

  return {
    filters: sessionStart.filters,
    sessionMode: sessionStart.sessionMode,
    sessionCount: sessionStart.sessionCount,
    sessionCountInputValue: sessionStart.sessionCountInputValue,
    availableCountStatus: availableCount.availableCountStatus,
    availableCount: availableCount.availableCount,
    tagLoadStatus: tags.tagLoadStatus,
    availableTags: tags.availableTags,
    sessionStartStatus: sessionStart.sessionStartStatus,
    sessionStartError: sessionStart.sessionStartError,
    incompleteSessionStatus: incomplete.incompleteSessionStatus,
    incompleteSessionError: incomplete.incompleteSessionError,
    incompleteSession: incomplete.incompleteSession,
    onSessionModeChange: sessionStart.onSessionModeChange,
    onSessionCountChange: sessionStart.onSessionCountChange,
    onSessionCountBlur: sessionStart.onSessionCountBlur,
    onToggleTag: sessionStart.onToggleTag,
    onDifficultyChange: sessionStart.onDifficultyChange,
    onStatusChange: sessionStart.onStatusChange,
    onStartSession: sessionStart.onStartSession,
    onAbandonIncompleteSession,
  };
}
