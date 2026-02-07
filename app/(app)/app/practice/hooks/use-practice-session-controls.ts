import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIsMounted } from '@/lib/use-is-mounted';
import {
  endPracticeSession,
  type GetIncompletePracticeSessionOutput,
  getIncompletePracticeSession,
  startPracticeSession,
} from '@/src/adapters/controllers/practice-controller';
import {
  getTags,
  type TagRow,
} from '@/src/adapters/controllers/tag-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import { navigateTo } from '../client-navigation';
import type { PracticeSessionStarterProps } from '../components/practice-session-starter';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '../practice-logic';
import {
  handleSessionCountChange,
  type PracticeFilters,
  startSession,
} from '../practice-page-logic';
import { usePracticeSessionHistory } from './use-practice-session-history';

type IncompletePracticeSession =
  NonNullable<GetIncompletePracticeSessionOutput>;

export type UsePracticeSessionControlsOutput = {
  filters: PracticeFilters;
  sessionMode: 'tutor' | 'exam';
  sessionCount: number;
  tagLoadStatus: 'idle' | 'loading' | 'error';
  availableTags: TagRow[];
  sessionStartStatus: 'idle' | 'loading' | 'error';
  sessionStartError: string | null;
  incompleteSessionStatus: 'idle' | 'loading' | 'error';
  incompleteSessionError: string | null;
  incompleteSession: IncompletePracticeSession | null;
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
  const [filters, setFilters] = useState<PracticeFilters>({
    tagSlugs: [],
    difficulties: [],
  });
  const [tagLoadStatus, setTagLoadStatus] = useState<
    'idle' | 'loading' | 'error'
  >('loading');
  const [availableTags, setAvailableTags] = useState<TagRow[]>([]);
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
  const [incompleteSessionStatus, setIncompleteSessionStatus] = useState<
    'idle' | 'loading' | 'error'
  >('loading');
  const [incompleteSessionError, setIncompleteSessionError] = useState<
    string | null
  >(null);
  const [incompleteSession, setIncompleteSession] =
    useState<IncompletePracticeSession | null>(null);
  const isMounted = useIsMounted();
  const sessionHistory = usePracticeSessionHistory();

  useEffect(() => {
    let mounted = true;
    setTagLoadStatus('loading');

    void (async () => {
      let res: Awaited<ReturnType<typeof getTags>>;
      try {
        res = await getTags({});
      } catch (error) {
        if (!mounted) return;
        console.error(
          '[PracticeSessionControls] Tag load failed:',
          getThrownErrorMessage(error),
        );
        setTagLoadStatus('error');
        return;
      }
      if (!mounted) return;

      if (!res.ok) {
        setTagLoadStatus('error');
        return;
      }

      setAvailableTags(res.data.rows);
      setTagLoadStatus('idle');
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setIncompleteSessionStatus('loading');
    setIncompleteSessionError(null);

    void (async () => {
      let res: Awaited<ReturnType<typeof getIncompletePracticeSession>>;
      try {
        res = await getIncompletePracticeSession({});
      } catch (error) {
        if (!mounted) return;
        setIncompleteSessionStatus('error');
        setIncompleteSessionError(getThrownErrorMessage(error));
        return;
      }
      if (!mounted) return;

      if (!res.ok) {
        setIncompleteSessionStatus('error');
        setIncompleteSessionError(getActionResultErrorMessage(res));
        return;
      }

      setIncompleteSession(res.data);
      setIncompleteSessionStatus('idle');
    })();

    return () => {
      mounted = false;
    };
  }, []);

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
        isMounted,
      }),
    [filters, sessionMode, sessionCount, startSessionIdempotencyKey, isMounted],
  );

  const onAbandonIncompleteSession = useCallback(async () => {
    if (!incompleteSession) return;

    setIncompleteSessionStatus('loading');
    setIncompleteSessionError(null);

    let res: Awaited<ReturnType<typeof endPracticeSession>>;
    try {
      res = await endPracticeSession({
        sessionId: incompleteSession.sessionId,
      });
    } catch (error) {
      if (!isMounted()) return;
      setIncompleteSessionStatus('error');
      setIncompleteSessionError(getThrownErrorMessage(error));
      return;
    }
    if (!isMounted()) return;

    if (!res.ok) {
      setIncompleteSessionStatus('error');
      setIncompleteSessionError(getActionResultErrorMessage(res));
      return;
    }

    setIncompleteSession(null);
    setIncompleteSessionStatus('idle');
  }, [incompleteSession, isMounted]);

  return {
    filters,
    sessionMode,
    sessionCount,
    tagLoadStatus,
    availableTags,
    sessionStartStatus,
    sessionStartError,
    incompleteSessionStatus,
    incompleteSessionError,
    incompleteSession,
    sessionHistoryStatus: sessionHistory.sessionHistoryStatus,
    sessionHistoryError: sessionHistory.sessionHistoryError,
    sessionHistoryRows: sessionHistory.sessionHistoryRows,
    selectedHistorySessionId: sessionHistory.selectedHistorySessionId,
    selectedHistoryReview: sessionHistory.selectedHistoryReview,
    historyReviewLoadState: sessionHistory.historyReviewLoadState,
    onSessionModeChange,
    onSessionCountChange,
    onToggleTag,
    onToggleDifficulty,
    onStartSession,
    onAbandonIncompleteSession,
    onOpenSessionHistory: sessionHistory.onOpenSessionHistory,
  };
}
