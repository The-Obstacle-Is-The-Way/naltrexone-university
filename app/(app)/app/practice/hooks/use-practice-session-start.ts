import { useMemo, useState } from 'react';
import { startPracticeSession } from '@/src/adapters/controllers/practice-controller';
import { navigateTo } from '../client-navigation';
import type { PracticeSessionStarterProps } from '../components/practice-session-starter';
import {
  createSessionCountChangeHandler,
  createSessionModeChangeHandler,
  createToggleDifficultyHandler,
  createToggleStatusHandler,
  createToggleTagHandler,
  type PracticeFilters,
  startSession,
} from '../practice-page-logic';

export type UsePracticeSessionStartInput = {
  isMounted: () => boolean;
};

export type UsePracticeSessionStartOutput = {
  filters: PracticeFilters;
  sessionMode: 'tutor' | 'exam';
  sessionCount: number;
  sessionStartStatus: 'idle' | 'loading' | 'error';
  sessionStartError: string | null;
  onSessionModeChange: PracticeSessionStarterProps['onSessionModeChange'];
  onSessionCountChange: PracticeSessionStarterProps['onSessionCountChange'];
  onToggleTag: PracticeSessionStarterProps['onToggleTag'];
  onToggleDifficulty: PracticeSessionStarterProps['onToggleDifficulty'];
  onToggleStatus: PracticeSessionStarterProps['onToggleStatus'];
  onStartSession: () => Promise<void>;
};

export function usePracticeSessionStart(
  input: UsePracticeSessionStartInput,
): UsePracticeSessionStartOutput {
  const [filters, setFilters] = useState<PracticeFilters>({
    tagSlugs: [],
    difficulties: [],
    statuses: [],
  });
  const [sessionMode, setSessionMode] = useState<'tutor' | 'exam'>('tutor');
  const [sessionCount, setSessionCount] = useState(20);
  const [startSessionIdempotencyKey, setStartSessionIdempotencyKey] = useState(
    () => crypto.randomUUID(),
  );
  const [sessionStartStatus, setSessionStartStatus] = useState<
    'idle' | 'loading' | 'error'
  >('idle');
  const [sessionStartError, setSessionStartError] = useState<string | null>(
    null,
  );

  const onSessionModeChange = useMemo(
    () =>
      createSessionModeChangeHandler({
        setSessionMode,
        setIdempotencyKey: setStartSessionIdempotencyKey,
        createIdempotencyKey: () => crypto.randomUUID(),
      }) satisfies PracticeSessionStarterProps['onSessionModeChange'],
    [],
  );

  const onSessionCountChange = useMemo(
    () =>
      createSessionCountChangeHandler({
        setSessionCount,
        setIdempotencyKey: setStartSessionIdempotencyKey,
        createIdempotencyKey: () => crypto.randomUUID(),
      }),
    [],
  );

  const onToggleTag = useMemo(
    () =>
      createToggleTagHandler({
        setFilters,
        setIdempotencyKey: setStartSessionIdempotencyKey,
        createIdempotencyKey: () => crypto.randomUUID(),
      }) satisfies PracticeSessionStarterProps['onToggleTag'],
    [],
  );

  const onToggleDifficulty = useMemo(
    () =>
      createToggleDifficultyHandler({
        setFilters,
        setIdempotencyKey: setStartSessionIdempotencyKey,
        createIdempotencyKey: () => crypto.randomUUID(),
      }) satisfies PracticeSessionStarterProps['onToggleDifficulty'],
    [],
  );

  const onToggleStatus = useMemo(
    () =>
      createToggleStatusHandler({
        setFilters,
        setIdempotencyKey: setStartSessionIdempotencyKey,
        createIdempotencyKey: () => crypto.randomUUID(),
      }) satisfies PracticeSessionStarterProps['onToggleStatus'],
    [],
  );

  const onStartSession = useMemo(
    () =>
      startSession.bind(null, {
        sessionMode,
        sessionCount,
        filters,
        idempotencyKey: startSessionIdempotencyKey,
        createIdempotencyKey: () => crypto.randomUUID(),
        setIdempotencyKey: setStartSessionIdempotencyKey,
        startPracticeSessionFn: startPracticeSession,
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
    ],
  );

  return {
    filters,
    sessionMode,
    sessionCount,
    sessionStartStatus,
    sessionStartError,
    onSessionModeChange,
    onSessionCountChange,
    onToggleTag,
    onToggleDifficulty,
    onToggleStatus,
    onStartSession,
  };
}
