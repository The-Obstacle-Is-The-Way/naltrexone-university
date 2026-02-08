import { useMemo, useState } from 'react';
import { startPracticeSession } from '@/src/adapters/controllers/practice-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import { navigateTo } from '../client-navigation';
import type { PracticeSessionStarterProps } from '../components/practice-session-starter';
import {
  handleSessionCountChange,
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
  onStartSession: () => Promise<void>;
};

export function usePracticeSessionStart(
  input: UsePracticeSessionStartInput,
): UsePracticeSessionStartOutput {
  const [filters, setFilters] = useState<PracticeFilters>({
    tagSlugs: [],
    difficulties: [],
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
      ((mode: string) => {
        if (mode === 'tutor' || mode === 'exam') {
          setSessionMode(mode);
          setStartSessionIdempotencyKey(crypto.randomUUID());
        }
      }) satisfies PracticeSessionStarterProps['onSessionModeChange'],
    [],
  );

  const onSessionCountChange = useMemo(
    () =>
      handleSessionCountChange.bind(null, (count) => {
        setSessionCount(count);
        setStartSessionIdempotencyKey(crypto.randomUUID());
      }),
    [],
  );

  const onToggleTag = useMemo(
    () =>
      ((slug: string) => {
        setFilters((prev) => {
          const existing = prev.tagSlugs;
          const next = existing.includes(slug)
            ? existing.filter((s) => s !== slug)
            : [...existing, slug];
          return { ...prev, tagSlugs: next };
        });
        setStartSessionIdempotencyKey(crypto.randomUUID());
      }) satisfies PracticeSessionStarterProps['onToggleTag'],
    [],
  );

  const onToggleDifficulty = useMemo(
    () =>
      ((difficulty: NextQuestion['difficulty']) => {
        setFilters((prev) => {
          const existing = prev.difficulties;
          const next = existing.includes(difficulty)
            ? existing.filter((d) => d !== difficulty)
            : [...existing, difficulty];

          return { ...prev, difficulties: next };
        });
        setStartSessionIdempotencyKey(crypto.randomUUID());
      }) satisfies PracticeSessionStarterProps['onToggleDifficulty'],
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
    onStartSession,
  };
}
