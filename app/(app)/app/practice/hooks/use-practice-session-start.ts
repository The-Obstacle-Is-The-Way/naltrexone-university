import { useCallback, useMemo, useRef, useState } from 'react';
import { reportClientError } from '@/lib/report-client-error';
import { startPracticeSession } from '@/src/adapters/controllers/practice-controller';
import { navigateTo } from '../client-navigation';
import type { PracticeSessionStarterProps } from '../components/practice-session-starter';
import {
  createDifficultyChangeHandler,
  createSessionCountBlurHandler,
  createSessionCountChangeHandler,
  createSessionModeChangeHandler,
  createStatusChangeHandler,
  createToggleTagHandler,
  DEFAULT_SESSION_COUNT,
  type PracticeFilters,
  startSession,
} from '../practice-page-logic';

export type UsePracticeSessionStartInput = {
  isMounted: () => boolean;
  refreshIncompleteSession?: () => Promise<void>;
};

export type UsePracticeSessionStartOutput = {
  filters: PracticeFilters;
  sessionMode: 'tutor' | 'exam';
  sessionCount: number;
  sessionCountInputValue: string;
  sessionStartStatus: 'idle' | 'loading' | 'error';
  sessionStartError: string | null;
  onSessionModeChange: PracticeSessionStarterProps['onSessionModeChange'];
  onSessionCountChange: PracticeSessionStarterProps['onSessionCountChange'];
  onSessionCountBlur: NonNullable<
    PracticeSessionStarterProps['onSessionCountBlur']
  >;
  onToggleTag: PracticeSessionStarterProps['onToggleTag'];
  onDifficultyChange: PracticeSessionStarterProps['onDifficultyChange'];
  onStatusChange: PracticeSessionStarterProps['onStatusChange'];
  onStartSession: () => Promise<void>;
};

export function usePracticeSessionStart(
  input: UsePracticeSessionStartInput,
): UsePracticeSessionStartOutput {
  const [filters, setFilters] = useState<PracticeFilters>({
    tagSlugs: [],
    difficulty: null,
    status: 'unanswered',
  });
  const [sessionMode, setSessionMode] = useState<'tutor' | 'exam'>('tutor');
  const [sessionCount, setSessionCount] = useState(DEFAULT_SESSION_COUNT);
  const [sessionCountInputValue, setSessionCountInputValue] = useState(
    String(DEFAULT_SESSION_COUNT),
  );
  const [startSessionIdempotencyKey, setStartSessionIdempotencyKeyState] =
    useState(() => crypto.randomUUID());
  const startSessionIdempotencyKeyRef = useRef(startSessionIdempotencyKey);
  const [sessionStartStatus, setSessionStartStatus] = useState<
    'idle' | 'loading' | 'error'
  >('idle');
  const [sessionStartError, setSessionStartError] = useState<string | null>(
    null,
  );
  const setStartSessionIdempotencyKey = useCallback((key: string) => {
    startSessionIdempotencyKeyRef.current = key;
    setStartSessionIdempotencyKeyState(key);
  }, []);

  const onSessionModeChange = useMemo(
    () =>
      createSessionModeChangeHandler({
        setSessionMode,
        setIdempotencyKey: setStartSessionIdempotencyKey,
        createIdempotencyKey: () => crypto.randomUUID(),
      }) satisfies PracticeSessionStarterProps['onSessionModeChange'],
    [setStartSessionIdempotencyKey],
  );

  const onSessionCountChange = useMemo(
    () =>
      createSessionCountChangeHandler({
        setSessionCountInputValue,
        setSessionCount,
        setIdempotencyKey: setStartSessionIdempotencyKey,
        createIdempotencyKey: () => crypto.randomUUID(),
      }),
    [setStartSessionIdempotencyKey],
  );

  const onSessionCountBlur = useMemo(
    () =>
      createSessionCountBlurHandler({
        sessionCount,
        setSessionCountInputValue,
      }),
    [sessionCount],
  );

  const onToggleTag = useMemo(
    () =>
      createToggleTagHandler({
        setFilters,
        setIdempotencyKey: setStartSessionIdempotencyKey,
        createIdempotencyKey: () => crypto.randomUUID(),
      }) satisfies PracticeSessionStarterProps['onToggleTag'],
    [setStartSessionIdempotencyKey],
  );

  const onDifficultyChange = useMemo(
    () =>
      createDifficultyChangeHandler({
        setFilters,
        setIdempotencyKey: setStartSessionIdempotencyKey,
        createIdempotencyKey: () => crypto.randomUUID(),
      }) satisfies PracticeSessionStarterProps['onDifficultyChange'],
    [setStartSessionIdempotencyKey],
  );

  const onStatusChange = useMemo(
    () =>
      createStatusChangeHandler({
        setFilters,
        setIdempotencyKey: setStartSessionIdempotencyKey,
        createIdempotencyKey: () => crypto.randomUUID(),
      }) satisfies PracticeSessionStarterProps['onStatusChange'],
    [setStartSessionIdempotencyKey],
  );

  const onStartSession = useMemo(
    () =>
      startSession.bind(null, {
        sessionMode,
        sessionCount,
        filters,
        idempotencyKey: startSessionIdempotencyKey,
        getLatestIdempotencyKey: () => startSessionIdempotencyKeyRef.current,
        createIdempotencyKey: () => crypto.randomUUID(),
        setIdempotencyKey: setStartSessionIdempotencyKey,
        startPracticeSessionFn: startPracticeSession,
        reportError: (error, context) => {
          reportClientError(error, {
            component: 'UsePracticeSessionStart',
            action: context.action,
          });
        },
        ...(input.refreshIncompleteSession
          ? { refreshIncompleteSession: input.refreshIncompleteSession }
          : {}),
        setSessionStartStatus,
        setSessionStartError,
        navigateTo,
        isMounted: input.isMounted,
      }),
    [
      filters,
      sessionMode,
      sessionCount,
      startSessionIdempotencyKey,
      input.isMounted,
      input.refreshIncompleteSession,
      setStartSessionIdempotencyKey,
    ],
  );

  return {
    filters,
    sessionMode,
    sessionCount,
    sessionCountInputValue,
    sessionStartStatus,
    sessionStartError,
    onSessionModeChange,
    onSessionCountChange,
    onSessionCountBlur,
    onToggleTag,
    onDifficultyChange,
    onStatusChange,
    onStartSession,
  };
}
