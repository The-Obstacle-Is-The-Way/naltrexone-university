import { useCallback, useMemo, useRef, useState } from 'react';
import { reportClientError } from '@/lib/report-client-error';
import { startPracticeSession } from '@/src/adapters/controllers/practice-actions';
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
  concurrentUncertaintyVersion: number;
  concurrentExecutionMayStillFinish: boolean;
};

type StartExecutionUncertaintyObservation = (mayStillFinish: boolean) => void;

export function usePracticeSessionStart(
  input: UsePracticeSessionStartInput,
): UsePracticeSessionStartOutput {
  const [filters, setFiltersState] = useState<PracticeFilters>({
    tagSlugs: [],
    difficulty: null,
    status: 'unanswered',
  });
  const [sessionMode, setSessionModeState] = useState<'tutor' | 'exam'>(
    'tutor',
  );
  const [sessionCount, setSessionCountState] = useState(DEFAULT_SESSION_COUNT);
  // BUG-304: the learner's latest choice, updated with each change, so a
  // start invoked before React re-renders still starts what was last chosen
  // rather than the earlier render's choice.
  const latestIntentRef = useRef({ filters, sessionMode, sessionCount });
  const setFilters = useCallback(
    (update: (prev: PracticeFilters) => PracticeFilters) => {
      const value = update(latestIntentRef.current.filters);
      latestIntentRef.current = { ...latestIntentRef.current, filters: value };
      setFiltersState(value);
    },
    [],
  );
  const setSessionMode = useCallback((value: 'tutor' | 'exam') => {
    latestIntentRef.current = {
      ...latestIntentRef.current,
      sessionMode: value,
    };
    setSessionModeState(value);
  }, []);
  const setSessionCount = useCallback((value: number) => {
    latestIntentRef.current = {
      ...latestIntentRef.current,
      sessionCount: value,
    };
    setSessionCountState(value);
  }, []);
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
    concurrentUncertaintyVersion: 0,
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
        concurrentUncertaintyVersion: 0,
        concurrentExecutionMayStillFinish: false,
      };
    }
    setStartSessionIdempotencyKeyState(key);
  }, []);

  // Claims an execution slot under the latest intent's key, which the
  // uncertainty record always tracks: both refs change together.
  const claimStartExecutionUncertainty = useCallback(
    (idempotencyKey: string): StartExecutionUncertaintyObservation => {
      const claimId = startExecutionUncertaintyRef.current.nextClaimId;
      const claimedConcurrentUncertaintyVersion =
        startExecutionUncertaintyRef.current.concurrentUncertaintyVersion;
      const claimObservedConcurrentUncertainty =
        startExecutionUncertaintyRef.current.concurrentExecutionMayStillFinish;
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
            concurrentUncertaintyVersion:
              current.concurrentUncertaintyVersion + 1,
            concurrentExecutionMayStillFinish: true,
          };
          return;
        }

        // Client claim identities do not encode server acquisition order.
        // This result settles only its reporting invocation; every other
        // invocation must publish its own outcome before retirement is safe.
        // It may consume concurrent uncertainty only when it was launched
        // after observing that exact uncertainty generation. A result from an
        // already-running invocation cannot causally order a later server
        // observation, regardless of client response order.
        const consumesObservedConcurrentUncertainty =
          claimObservedConcurrentUncertainty &&
          current.concurrentUncertaintyVersion ===
            claimedConcurrentUncertaintyVersion;
        startExecutionUncertaintyRef.current = {
          ...current,
          unsettledClaimIds: remainingClaimIds,
          concurrentExecutionMayStillFinish:
            consumesObservedConcurrentUncertainty
              ? false
              : current.concurrentExecutionMayStillFinish,
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
    [setSessionMode, setStartSessionIdempotencyKey],
  );

  const onSessionCountChange = useMemo(
    () =>
      createSessionCountChangeHandler({
        setSessionCountInputValue,
        setSessionCount,
        setIdempotencyKey: setStartSessionIdempotencyKey,
        createIdempotencyKey: () => crypto.randomUUID(),
      }),
    [setSessionCount, setStartSessionIdempotencyKey],
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
    [setFilters, setStartSessionIdempotencyKey],
  );

  const onDifficultyChange = useMemo(
    () =>
      createDifficultyChangeHandler({
        setFilters,
        setIdempotencyKey: setStartSessionIdempotencyKey,
        createIdempotencyKey: () => crypto.randomUUID(),
      }) satisfies PracticeSessionStarterProps['onDifficultyChange'],
    [setFilters, setStartSessionIdempotencyKey],
  );

  const onStatusChange = useMemo(
    () =>
      createStatusChangeHandler({
        setFilters,
        setIdempotencyKey: setStartSessionIdempotencyKey,
        createIdempotencyKey: () => crypto.randomUUID(),
      }) satisfies PracticeSessionStarterProps['onStatusChange'],
    [setFilters, setStartSessionIdempotencyKey],
  );

  // BUG-304: a start always submits the latest choice under its key, even
  // when invoked through a handler captured before the latest re-render.
  const onStartSession = useCallback(() => {
    const idempotencyKey = startSessionIdempotencyKeyRef.current;
    const { filters, sessionMode, sessionCount } = latestIntentRef.current;
    const setConcurrentExecutionUncertainty =
      claimStartExecutionUncertainty(idempotencyKey);
    const tryRetireIdempotencyKeyAfterProvenAbsence =
      captureIdempotencyKeyRetirement();

    return startSession({
      sessionMode,
      sessionCount,
      filters,
      idempotencyKey,
      getLatestIdempotencyKey: () => startSessionIdempotencyKeyRef.current,
      createIdempotencyKey: () => crypto.randomUUID(),
      setIdempotencyKey: setStartSessionIdempotencyKey,
      tryRetireIdempotencyKeyAfterProvenAbsence,
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
    captureIdempotencyKeyRetirement,
    claimStartExecutionUncertainty,
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
