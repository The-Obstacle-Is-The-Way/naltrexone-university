import { useCallback, useMemo, useRef, useState } from 'react';
import { reportClientError } from '@/lib/report-client-error';
import { startPracticeSession } from '@/src/adapters/controllers/practice-controller';
import { navigateTo } from '../client-navigation';
import type { PracticeSessionStarterProps } from '../components/practice-session-starter';
import type { IncompleteSessionRefreshOutcome } from '../practice-page-incomplete-session';
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
  refreshIncompleteSession: () => Promise<
    IncompleteSessionRefreshOutcome<unknown>
  >;
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
  captureIdempotencyKeyRetirement: () => () => boolean;
};

type StartExecutionUncertainty = {
  idempotencyKey: string;
  nextClaimId: number;
  unsettledClaimIds: ReadonlySet<number>;
  settledVersion: number;
  concurrentExecutionMayStillFinish: boolean;
};

type StartExecutionUncertaintyObservation = (mayStillFinish: boolean) => void;

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
  const startExecutionUncertaintyRef = useRef<StartExecutionUncertainty>({
    idempotencyKey: startSessionIdempotencyKey,
    nextClaimId: 1,
    unsettledClaimIds: new Set(),
    settledVersion: 0,
    concurrentExecutionMayStillFinish: false,
  });
  const [sessionStartStatus, setSessionStartStatus] = useState<
    'idle' | 'loading' | 'error'
  >('idle');
  const [sessionStartError, setSessionStartError] = useState<string | null>(
    null,
  );
  const setStartSessionIdempotencyKey = useCallback((key: string) => {
    startSessionIdempotencyKeyRef.current = key;
    if (startExecutionUncertaintyRef.current.idempotencyKey !== key) {
      startExecutionUncertaintyRef.current = {
        idempotencyKey: key,
        nextClaimId: 1,
        unsettledClaimIds: new Set(),
        settledVersion: 0,
        concurrentExecutionMayStillFinish: false,
      };
    }
    setStartSessionIdempotencyKeyState(key);
  }, []);

  const claimStartExecutionUncertainty = useCallback(
    (idempotencyKey: string): StartExecutionUncertaintyObservation | null => {
      if (
        startExecutionUncertaintyRef.current.idempotencyKey !== idempotencyKey
      ) {
        // A stale render may still invoke an old handler after a newer intent
        // owns the slot. Reject it before it can submit obsolete intent or
        // mutate the newer request's UI state.
        return null;
      }
      const claimId = startExecutionUncertaintyRef.current.nextClaimId;
      const claimedSettledVersion =
        startExecutionUncertaintyRef.current.settledVersion;
      const unsettledClaimIds = new Set(
        startExecutionUncertaintyRef.current.unsettledClaimIds,
      );
      unsettledClaimIds.add(claimId);
      startExecutionUncertaintyRef.current = {
        ...startExecutionUncertaintyRef.current,
        nextClaimId: claimId + 1,
        unsettledClaimIds,
      };

      return (mayStillFinish: boolean) => {
        const current = startExecutionUncertaintyRef.current;
        if (
          current.idempotencyKey !== idempotencyKey ||
          !current.unsettledClaimIds.has(claimId)
        ) {
          return;
        }

        const remainingClaimIds = new Set(current.unsettledClaimIds);
        remainingClaimIds.delete(claimId);

        if (mayStillFinish) {
          startExecutionUncertaintyRef.current = {
            ...current,
            unsettledClaimIds: remainingClaimIds,
            concurrentExecutionMayStillFinish:
              current.concurrentExecutionMayStillFinish ||
              current.settledVersion === claimedSettledVersion,
          };
          return;
        }

        // A settled same-key result consumes indeterminate claims launched no
        // later than itself. Claims launched after it may still acquire a
        // released transient wrapper claim and must keep fencing retirement.
        for (const remainingClaimId of remainingClaimIds) {
          if (remainingClaimId <= claimId) {
            remainingClaimIds.delete(remainingClaimId);
          }
        }
        startExecutionUncertaintyRef.current = {
          ...current,
          unsettledClaimIds: remainingClaimIds,
          settledVersion: current.settledVersion + 1,
          concurrentExecutionMayStillFinish: false,
        };
      };
    },
    [],
  );

  // Capture the key whose recovery lifecycle is being resolved. The returned
  // fence refuses to retire either a newer intent or a captured key whose
  // same-key execution may still commit.
  const captureIdempotencyKeyRetirement = useCallback(() => {
    const capturedKey = startSessionIdempotencyKeyRef.current;

    return () => {
      if (startSessionIdempotencyKeyRef.current !== capturedKey) return false;
      const uncertainty = startExecutionUncertaintyRef.current;
      if (
        uncertainty.idempotencyKey === capturedKey &&
        (uncertainty.unsettledClaimIds.size > 0 ||
          uncertainty.concurrentExecutionMayStillFinish)
      ) {
        return false;
      }
      setStartSessionIdempotencyKey(crypto.randomUUID());
      return true;
    };
  }, [setStartSessionIdempotencyKey]);

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

  const onStartSession = useCallback(() => {
    const setConcurrentExecutionUncertainty = claimStartExecutionUncertainty(
      startSessionIdempotencyKey,
    );
    if (!setConcurrentExecutionUncertainty) {
      return Promise.resolve();
    }

    return startSession({
      sessionMode,
      sessionCount,
      filters,
      idempotencyKey: startSessionIdempotencyKey,
      getLatestIdempotencyKey: () => startSessionIdempotencyKeyRef.current,
      createIdempotencyKey: () => crypto.randomUUID(),
      setIdempotencyKey: setStartSessionIdempotencyKey,
      setConcurrentExecutionUncertainty,
      startPracticeSessionFn: startPracticeSession,
      reportError: (error, context) => {
        reportClientError(error, {
          component: 'UsePracticeSessionStart',
          action: context.action,
        });
      },
      refreshIncompleteSession: input.refreshIncompleteSession,
      setSessionStartStatus,
      setSessionStartError,
      navigateTo,
      isMounted: input.isMounted,
    });
  }, [
    claimStartExecutionUncertainty,
    filters,
    sessionMode,
    sessionCount,
    startSessionIdempotencyKey,
    input.isMounted,
    input.refreshIncompleteSession,
    setStartSessionIdempotencyKey,
  ]);

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
    captureIdempotencyKeyRetirement,
  };
}
