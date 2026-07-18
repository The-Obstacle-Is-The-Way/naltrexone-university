import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { Button } from '@/components/ui/button';
import * as reportClientError from '@/lib/report-client-error';
import { TimeoutError } from '@/lib/with-timeout';
import { err } from '@/src/adapters/controllers/action-result';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import * as tagController from '@/src/adapters/controllers/tag-controller';
import { ApplicationConflictReasons } from '@/src/application/errors';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import { installReportClientErrorMocks } from '@/tests/test-helpers/report-client-error-mocks';
import { usePracticeSessionControls } from './use-practice-session-controls';

vi.mock('@/src/adapters/controllers/tag-controller', { spy: true });
vi.mock('@/src/adapters/controllers/practice-controller', { spy: true });
vi.mock('@/lib/report-client-error', { spy: true });

const getTags = vi.mocked(tagController.getTags);
const countAvailableQuestions = vi.mocked(
  practiceController.countAvailableQuestions,
);
const endPracticeSession = vi.mocked(practiceController.endPracticeSession);
const getIncompletePracticeSession = vi.mocked(
  practiceController.getIncompletePracticeSession,
);
const startPracticeSession = vi.mocked(practiceController.startPracticeSession);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

installReportClientErrorMocks(reportClientError);

function RecoveryHookProbe() {
  const output = usePracticeSessionControls();
  const originalOnStartSessionRef = useRef(output.onStartSession);

  return (
    <>
      <div data-testid="incomplete-load-status">
        {output.incompleteSessionStatus}
      </div>
      <div data-testid="incomplete-session-id">
        {output.incompleteSession?.sessionId ?? ''}
      </div>
      <div data-testid="session-start-status">{output.sessionStartStatus}</div>
      <Button
        type="button"
        onClick={() => {
          void output.onStartSession();
        }}
      >
        start-session
      </Button>
      <Button
        type="button"
        onClick={() => {
          void originalOnStartSessionRef.current();
        }}
      >
        start-original-handler
      </Button>
      <Button
        type="button"
        onClick={() => {
          void output.onAbandonIncompleteSession();
        }}
      >
        abandon-incomplete-session
      </Button>
      <Button type="button" onClick={() => output.onSessionModeChange('exam')}>
        change-start-intent
      </Button>
    </>
  );
}

function arrangeControlDependencies(): void {
  getTags.mockResolvedValue(ok({ rows: [] }));
  countAvailableQuestions.mockResolvedValue(ok({ count: 20 }));
}

function getCallIdempotencyKey(
  calls: readonly (readonly unknown[])[],
  index: number,
): unknown {
  return (calls[index]?.[0] as { idempotencyKey?: unknown } | undefined)
    ?.idempotencyKey;
}

describe('usePracticeSessionControls recovery convergence (browser)', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('refreshes after a bare tutor conflict and retires the resolved session start key', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111120';
    arrangeControlDependencies();
    getIncompletePracticeSession
      .mockResolvedValueOnce(ok(null))
      .mockResolvedValueOnce(
        ok({
          sessionId,
          mode: 'tutor',
          answeredCount: 0,
          totalCount: 20,
          startedAt: '2026-07-14T00:00:00.000Z',
        }),
      )
      .mockResolvedValue(ok(null));
    startPracticeSession.mockResolvedValue(
      err(
        'INTERNAL_ERROR',
        'Idempotency outcome could not be recorded after committed success',
      ),
    );
    endPracticeSession.mockResolvedValue(
      err('CONFLICT', 'Practice session already ended'),
    );

    const screen = await render(<RecoveryHookProbe />);
    await expect
      .element(screen.getByTestId('incomplete-load-status'))
      .toHaveTextContent('idle');

    await screen.getByRole('button', { name: 'start-session' }).click();
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(sessionId);
    const firstStartKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      0,
    );

    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(/^$/);
    expect(getIncompletePracticeSession).toHaveBeenCalledTimes(3);

    await screen.getByRole('button', { name: 'start-session' }).click();
    await vi.waitFor(() =>
      expect(startPracticeSession).toHaveBeenCalledTimes(2),
    );
    const secondStartKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      1,
    );
    expect(firstStartKey).toEqual(expect.stringMatching(UUID_PATTERN));
    expect(secondStartKey).toEqual(expect.stringMatching(UUID_PATTERN));
    expect(secondStartKey).not.toBe(firstStartKey);
  });

  it('preserves the abandon key and panel when a timeout refresh still finds the session', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111121';
    const incompleteSession = {
      sessionId,
      mode: 'tutor' as const,
      answeredCount: 0,
      totalCount: 20,
      startedAt: '2026-07-14T00:00:00.000Z',
    };
    arrangeControlDependencies();
    getIncompletePracticeSession.mockResolvedValue(ok(incompleteSession));
    endPracticeSession
      .mockRejectedValueOnce(new TimeoutError(15_000))
      .mockResolvedValueOnce(
        ok({
          sessionId,
          mode: 'tutor',
          questionCount: 20,
          endedAt: '2026-07-14T01:00:00.000Z',
          totals: {
            answered: 0,
            correct: 0,
            accuracy: 0,
            durationSeconds: 60,
          },
        }),
      );

    const screen = await render(<RecoveryHookProbe />);
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(sessionId);

    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();
    await vi.waitFor(() =>
      expect(getIncompletePracticeSession).toHaveBeenCalledTimes(2),
    );
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(sessionId);
    const firstAbandonKey = getCallIdempotencyKey(
      endPracticeSession.mock.calls,
      0,
    );

    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();
    await vi.waitFor(() => expect(endPracticeSession).toHaveBeenCalledTimes(2));
    const secondAbandonKey = getCallIdempotencyKey(
      endPracticeSession.mock.calls,
      1,
    );

    expect(firstAbandonKey).toEqual(expect.stringMatching(UUID_PATTERN));
    expect(secondAbandonKey).toBe(firstAbandonKey);
  });

  it('contains a failed refresh after abandon failure without clearing state or rotating the key', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111122';
    arrangeControlDependencies();
    getIncompletePracticeSession
      .mockResolvedValueOnce(
        ok({
          sessionId,
          mode: 'tutor',
          answeredCount: 0,
          totalCount: 20,
          startedAt: '2026-07-14T00:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(err('INTERNAL_ERROR', 'Refresh failed'));
    endPracticeSession
      .mockResolvedValueOnce(err('CONFLICT', 'Practice session already ended'))
      .mockResolvedValueOnce(
        ok({
          sessionId,
          mode: 'tutor',
          questionCount: 20,
          endedAt: '2026-07-14T01:00:00.000Z',
          totals: {
            answered: 0,
            correct: 0,
            accuracy: 0,
            durationSeconds: 60,
          },
        }),
      );

    const screen = await render(<RecoveryHookProbe />);
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(sessionId);

    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();
    await expect
      .element(screen.getByTestId('incomplete-load-status'))
      .toHaveTextContent('error');
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(sessionId);
    expect(getIncompletePracticeSession).toHaveBeenCalledTimes(2);
    const firstAbandonKey = getCallIdempotencyKey(
      endPracticeSession.mock.calls,
      0,
    );

    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();
    await vi.waitFor(() => expect(endPracticeSession).toHaveBeenCalledTimes(2));
    const secondAbandonKey = getCallIdempotencyKey(
      endPracticeSession.mock.calls,
      1,
    );
    expect(secondAbandonKey).toBe(firstAbandonKey);
  });

  it('retires the poisoned start key when a second-tab refresh proves resolution', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111123';
    arrangeControlDependencies();
    getIncompletePracticeSession
      .mockResolvedValueOnce(
        ok({
          sessionId,
          mode: 'tutor',
          answeredCount: 0,
          totalCount: 20,
          startedAt: '2026-07-14T00:00:00.000Z',
        }),
      )
      .mockResolvedValue(ok(null));
    startPracticeSession.mockResolvedValue(
      err(
        'INTERNAL_ERROR',
        'Idempotency outcome could not be recorded after committed success',
      ),
    );

    const screen = await render(<RecoveryHookProbe />);
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(sessionId);

    await screen.getByRole('button', { name: 'start-session' }).click();
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(/^$/);
    const firstStartKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      0,
    );

    await screen.getByRole('button', { name: 'start-session' }).click();
    await vi.waitFor(() =>
      expect(startPracticeSession).toHaveBeenCalledTimes(2),
    );
    const secondStartKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      1,
    );

    expect(firstStartKey).toEqual(expect.stringMatching(UUID_PATTERN));
    expect(secondStartKey).toEqual(expect.stringMatching(UUID_PATTERN));
    expect(secondStartKey).not.toBe(firstStartKey);
  });

  it('preserves a still-running start key when abandoning an unrelated refreshed session', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111125';
    const incompleteSession = {
      sessionId,
      mode: 'tutor' as const,
      answeredCount: 0,
      totalCount: 20,
      startedAt: '2026-07-17T00:00:00.000Z',
    };
    arrangeControlDependencies();
    getIncompletePracticeSession
      .mockResolvedValueOnce(ok(null))
      .mockResolvedValueOnce(ok(incompleteSession))
      .mockResolvedValue(ok(null));
    startPracticeSession.mockResolvedValue(
      err('CONFLICT', 'Request is still running', undefined, {
        reason: ApplicationConflictReasons.ConcurrentRequestInProgress,
      }),
    );
    endPracticeSession.mockResolvedValue(
      ok({
        sessionId,
        mode: 'tutor',
        questionCount: 20,
        endedAt: '2026-07-17T01:00:00.000Z',
        totals: {
          answered: 0,
          correct: 0,
          accuracy: 0,
          durationSeconds: 60,
        },
      }),
    );

    const screen = await render(<RecoveryHookProbe />);
    await expect
      .element(screen.getByTestId('incomplete-load-status'))
      .toHaveTextContent('idle');

    await screen.getByRole('button', { name: 'start-session' }).click();
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(sessionId);
    const firstStartKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      0,
    );

    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(/^$/);

    await screen.getByRole('button', { name: 'start-session' }).click();
    await vi.waitFor(() =>
      expect(startPracticeSession).toHaveBeenCalledTimes(2),
    );
    const secondStartKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      1,
    );

    expect(firstStartKey).toEqual(expect.stringMatching(UUID_PATTERN));
    expect(secondStartKey).toBe(firstStartKey);
  });

  it('preserves a timed-out start key when abandoning an unrelated refreshed session', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111129';
    const initialRefresh =
      createDeferred<
        Awaited<
          ReturnType<typeof practiceController.getIncompletePracticeSession>
        >
      >();
    const incompleteSession = {
      sessionId,
      mode: 'tutor' as const,
      answeredCount: 0,
      totalCount: 20,
      startedAt: '2026-07-17T00:00:00.000Z',
    };
    arrangeControlDependencies();
    getIncompletePracticeSession
      .mockImplementationOnce(() => initialRefresh.promise)
      .mockResolvedValue(ok(null));
    startPracticeSession
      .mockRejectedValueOnce(new TimeoutError(15_000))
      .mockResolvedValue(err('INTERNAL_ERROR', 'Recorded start failed'));
    endPracticeSession.mockResolvedValue(
      ok({
        sessionId,
        mode: 'tutor',
        questionCount: 20,
        endedAt: '2026-07-17T01:00:00.000Z',
        totals: {
          answered: 0,
          correct: 0,
          accuracy: 0,
          durationSeconds: 60,
        },
      }),
    );

    const screen = await render(<RecoveryHookProbe />);
    await expect
      .element(screen.getByTestId('incomplete-load-status'))
      .toHaveTextContent('loading');

    await screen.getByRole('button', { name: 'start-session' }).click();
    await expect
      .element(screen.getByTestId('session-start-status'))
      .toHaveTextContent('error');
    const timedOutStartKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      0,
    );

    initialRefresh.resolve(ok(incompleteSession));
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(sessionId);

    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(/^$/);

    await screen.getByRole('button', { name: 'start-session' }).click();
    await vi.waitFor(() =>
      expect(startPracticeSession).toHaveBeenCalledTimes(2),
    );
    const retriedStartKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      1,
    );

    expect(timedOutStartKey).toEqual(expect.stringMatching(UUID_PATTERN));
    expect(retriedStartKey).toBe(timedOutStartKey);
  });

  it('allows retirement after a same-key result consumes concurrent uncertainty', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111126';
    const incompleteSession = {
      sessionId,
      mode: 'tutor' as const,
      answeredCount: 0,
      totalCount: 20,
      startedAt: '2026-07-17T00:00:00.000Z',
    };
    arrangeControlDependencies();
    getIncompletePracticeSession
      .mockResolvedValueOnce(ok(null))
      .mockResolvedValueOnce(ok(incompleteSession))
      .mockResolvedValueOnce(ok(incompleteSession))
      .mockResolvedValue(ok(null));
    startPracticeSession
      .mockResolvedValueOnce(
        err('CONFLICT', 'Request is still running', undefined, {
          reason: ApplicationConflictReasons.ConcurrentRequestInProgress,
        }),
      )
      .mockResolvedValue(err('INTERNAL_ERROR', 'Recorded start failed'));
    endPracticeSession.mockResolvedValue(
      ok({
        sessionId,
        mode: 'tutor',
        questionCount: 20,
        endedAt: '2026-07-17T01:00:00.000Z',
        totals: {
          answered: 0,
          correct: 0,
          accuracy: 0,
          durationSeconds: 60,
        },
      }),
    );

    const screen = await render(<RecoveryHookProbe />);
    await expect
      .element(screen.getByTestId('incomplete-load-status'))
      .toHaveTextContent('idle');

    await screen.getByRole('button', { name: 'start-session' }).click();
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(sessionId);
    const firstStartKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      0,
    );

    await screen.getByRole('button', { name: 'start-session' }).click();
    await vi.waitFor(() =>
      expect(getIncompletePracticeSession).toHaveBeenCalledTimes(3),
    );
    expect(getCallIdempotencyKey(startPracticeSession.mock.calls, 1)).toBe(
      firstStartKey,
    );

    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(/^$/);

    await screen.getByRole('button', { name: 'start-session' }).click();
    await vi.waitFor(() =>
      expect(startPracticeSession).toHaveBeenCalledTimes(3),
    );
    const thirdStartKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      2,
    );

    expect(firstStartKey).toEqual(expect.stringMatching(UUID_PATTERN));
    expect(thirdStartKey).toEqual(expect.stringMatching(UUID_PATTERN));
    expect(thirdStartKey).not.toBe(firstStartKey);
  });

  it('preserves the key while a later same-key invocation remains unsettled', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111129';
    const firstSettledResult =
      createDeferred<
        Awaited<ReturnType<typeof practiceController.startPracticeSession>>
      >();
    const laterUnsettledResult =
      createDeferred<
        Awaited<ReturnType<typeof practiceController.startPracticeSession>>
      >();
    const thirdSettledResult =
      createDeferred<
        Awaited<ReturnType<typeof practiceController.startPracticeSession>>
      >();
    const incompleteSession = {
      sessionId,
      mode: 'tutor' as const,
      answeredCount: 0,
      totalCount: 20,
      startedAt: '2026-07-17T00:00:00.000Z',
    };
    arrangeControlDependencies();
    getIncompletePracticeSession
      .mockResolvedValueOnce(ok(null))
      .mockResolvedValueOnce(ok(incompleteSession))
      .mockResolvedValue(ok(null));
    startPracticeSession
      .mockImplementationOnce(() => firstSettledResult.promise)
      .mockImplementationOnce(() => laterUnsettledResult.promise)
      .mockImplementationOnce(() => thirdSettledResult.promise);
    endPracticeSession.mockResolvedValue(
      ok({
        sessionId,
        mode: 'tutor',
        questionCount: 20,
        endedAt: '2026-07-17T01:00:00.000Z',
        totals: {
          answered: 0,
          correct: 0,
          accuracy: 0,
          durationSeconds: 60,
        },
      }),
    );

    const screen = await render(<RecoveryHookProbe />);
    await expect
      .element(screen.getByTestId('incomplete-load-status'))
      .toHaveTextContent('idle');

    await screen.getByRole('button', { name: 'start-session' }).click();
    await screen.getByRole('button', { name: 'start-session' }).click();
    await vi.waitFor(() =>
      expect(startPracticeSession).toHaveBeenCalledTimes(2),
    );
    const firstStartKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      0,
    );
    expect(getCallIdempotencyKey(startPracticeSession.mock.calls, 1)).toBe(
      firstStartKey,
    );

    firstSettledResult.resolve(err('INTERNAL_ERROR', 'Recorded start failed'));
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(sessionId);

    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(/^$/);

    await screen.getByRole('button', { name: 'start-session' }).click();
    await vi.waitFor(() =>
      expect(startPracticeSession).toHaveBeenCalledTimes(3),
    );
    const thirdStartKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      2,
    );

    expect(firstStartKey).toEqual(expect.stringMatching(UUID_PATTERN));
    expect(thirdStartKey).toBe(firstStartKey);

    const refreshCountBeforeLaterSettlement =
      getIncompletePracticeSession.mock.calls.length;
    laterUnsettledResult.resolve(
      err('CONFLICT', 'Request is still running', undefined, {
        reason: ApplicationConflictReasons.ConcurrentRequestInProgress,
      }),
    );
    await laterUnsettledResult.promise;
    await vi.waitFor(() =>
      expect(getIncompletePracticeSession).toHaveBeenCalledTimes(
        refreshCountBeforeLaterSettlement + 1,
      ),
    );

    const refreshCountBeforeThirdSettlement =
      getIncompletePracticeSession.mock.calls.length;
    thirdSettledResult.resolve(err('INTERNAL_ERROR', 'Recorded start failed'));
    await thirdSettledResult.promise;
    await vi.waitFor(() =>
      expect(getIncompletePracticeSession).toHaveBeenCalledTimes(
        refreshCountBeforeThirdSettlement + 1,
      ),
    );
  });

  it('preserves the key when a settled failure proves absence while a later same-key invocation remains unsettled', async () => {
    const firstSettledResult =
      createDeferred<
        Awaited<ReturnType<typeof practiceController.startPracticeSession>>
      >();
    const laterUnsettledResult =
      createDeferred<
        Awaited<ReturnType<typeof practiceController.startPracticeSession>>
      >();
    const thirdSettledResult =
      createDeferred<
        Awaited<ReturnType<typeof practiceController.startPracticeSession>>
      >();
    arrangeControlDependencies();
    getIncompletePracticeSession.mockResolvedValue(ok(null));
    startPracticeSession
      .mockImplementationOnce(() => firstSettledResult.promise)
      .mockImplementationOnce(() => laterUnsettledResult.promise)
      .mockImplementationOnce(() => thirdSettledResult.promise);

    const screen = await render(<RecoveryHookProbe />);
    await expect
      .element(screen.getByTestId('incomplete-load-status'))
      .toHaveTextContent('idle');

    await screen.getByRole('button', { name: 'start-session' }).click();
    await screen.getByRole('button', { name: 'start-session' }).click();
    await vi.waitFor(() =>
      expect(startPracticeSession).toHaveBeenCalledTimes(2),
    );
    const firstStartKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      0,
    );
    expect(getCallIdempotencyKey(startPracticeSession.mock.calls, 1)).toBe(
      firstStartKey,
    );

    const refreshCountBeforeFirstSettlement =
      getIncompletePracticeSession.mock.calls.length;
    firstSettledResult.resolve(err('INTERNAL_ERROR', 'Recorded start failed'));
    await firstSettledResult.promise;
    await vi.waitFor(() =>
      expect(getIncompletePracticeSession).toHaveBeenCalledTimes(
        refreshCountBeforeFirstSettlement + 1,
      ),
    );

    await screen.getByRole('button', { name: 'start-session' }).click();
    await vi.waitFor(() =>
      expect(startPracticeSession).toHaveBeenCalledTimes(3),
    );
    const thirdStartKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      2,
    );

    expect(firstStartKey).toEqual(expect.stringMatching(UUID_PATTERN));
    expect(thirdStartKey).toBe(firstStartKey);

    const refreshCountBeforeLaterSettlement =
      getIncompletePracticeSession.mock.calls.length;
    laterUnsettledResult.resolve(
      err('CONFLICT', 'Request is still running', undefined, {
        reason: ApplicationConflictReasons.ConcurrentRequestInProgress,
      }),
    );
    await laterUnsettledResult.promise;
    await vi.waitFor(() =>
      expect(getIncompletePracticeSession).toHaveBeenCalledTimes(
        refreshCountBeforeLaterSettlement + 1,
      ),
    );

    const refreshCountBeforeThirdSettlement =
      getIncompletePracticeSession.mock.calls.length;
    thirdSettledResult.resolve(err('INTERNAL_ERROR', 'Recorded start failed'));
    await thirdSettledResult.promise;
    await vi.waitFor(() =>
      expect(getIncompletePracticeSession).toHaveBeenCalledTimes(
        refreshCountBeforeThirdSettlement + 1,
      ),
    );
  });

  it('does not let a stale concurrent observation override a later settled result', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111127';
    const settledResult =
      createDeferred<
        Awaited<ReturnType<typeof practiceController.startPracticeSession>>
      >();
    const staleConcurrentResult =
      createDeferred<
        Awaited<ReturnType<typeof practiceController.startPracticeSession>>
      >();
    const incompleteSession = {
      sessionId,
      mode: 'tutor' as const,
      answeredCount: 0,
      totalCount: 20,
      startedAt: '2026-07-17T00:00:00.000Z',
    };
    arrangeControlDependencies();
    getIncompletePracticeSession
      .mockResolvedValueOnce(ok(null))
      .mockResolvedValueOnce(ok(incompleteSession))
      .mockResolvedValueOnce(ok(incompleteSession))
      .mockResolvedValue(ok(null));
    startPracticeSession
      .mockImplementationOnce(() => settledResult.promise)
      .mockImplementationOnce(() => staleConcurrentResult.promise)
      .mockResolvedValue(err('INTERNAL_ERROR', 'Recorded start failed'));
    endPracticeSession.mockResolvedValue(
      ok({
        sessionId,
        mode: 'tutor',
        questionCount: 20,
        endedAt: '2026-07-17T01:00:00.000Z',
        totals: {
          answered: 0,
          correct: 0,
          accuracy: 0,
          durationSeconds: 60,
        },
      }),
    );

    const screen = await render(<RecoveryHookProbe />);
    await expect
      .element(screen.getByTestId('incomplete-load-status'))
      .toHaveTextContent('idle');

    await screen.getByRole('button', { name: 'start-session' }).click();
    await screen.getByRole('button', { name: 'start-session' }).click();
    await vi.waitFor(() =>
      expect(startPracticeSession).toHaveBeenCalledTimes(2),
    );
    const firstStartKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      0,
    );
    expect(getCallIdempotencyKey(startPracticeSession.mock.calls, 1)).toBe(
      firstStartKey,
    );

    settledResult.resolve(err('INTERNAL_ERROR', 'Recorded start failed'));
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(sessionId);

    staleConcurrentResult.resolve(
      err('CONFLICT', 'Request is still running', undefined, {
        reason: ApplicationConflictReasons.ConcurrentRequestInProgress,
      }),
    );
    await vi.waitFor(() =>
      expect(getIncompletePracticeSession).toHaveBeenCalledTimes(3),
    );

    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(/^$/);

    await screen.getByRole('button', { name: 'start-session' }).click();
    await vi.waitFor(() =>
      expect(startPracticeSession).toHaveBeenCalledTimes(3),
    );
    const thirdStartKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      2,
    );

    expect(firstStartKey).toEqual(expect.stringMatching(UUID_PATTERN));
    expect(thirdStartKey).toEqual(expect.stringMatching(UUID_PATTERN));
    expect(thirdStartKey).not.toBe(firstStartKey);
  });

  it('rejects a stale start handler without changing the newer request state', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111128';
    const incompleteSession = {
      sessionId,
      mode: 'tutor' as const,
      answeredCount: 0,
      totalCount: 20,
      startedAt: '2026-07-17T00:00:00.000Z',
    };
    arrangeControlDependencies();
    getIncompletePracticeSession
      .mockResolvedValueOnce(ok(null))
      .mockResolvedValueOnce(ok(incompleteSession))
      .mockResolvedValue(ok(null));
    startPracticeSession.mockResolvedValue(
      err('CONFLICT', 'Request is still running', undefined, {
        reason: ApplicationConflictReasons.ConcurrentRequestInProgress,
      }),
    );
    endPracticeSession.mockResolvedValue(
      ok({
        sessionId,
        mode: 'tutor',
        questionCount: 20,
        endedAt: '2026-07-17T01:00:00.000Z',
        totals: {
          answered: 0,
          correct: 0,
          accuracy: 0,
          durationSeconds: 60,
        },
      }),
    );

    const screen = await render(<RecoveryHookProbe />);
    await expect
      .element(screen.getByTestId('incomplete-load-status'))
      .toHaveTextContent('idle');

    await screen.getByRole('button', { name: 'change-start-intent' }).click();
    await screen.getByRole('button', { name: 'start-session' }).click();
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(sessionId);
    await expect
      .element(screen.getByTestId('session-start-status'))
      .toHaveTextContent('error');
    const currentStartKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      0,
    );

    await screen
      .getByRole('button', { name: 'start-original-handler' })
      .click();
    expect(startPracticeSession).toHaveBeenCalledTimes(1);
    await expect
      .element(screen.getByTestId('session-start-status'))
      .toHaveTextContent('error');

    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(/^$/);

    await screen.getByRole('button', { name: 'start-session' }).click();
    await vi.waitFor(() =>
      expect(startPracticeSession).toHaveBeenCalledTimes(2),
    );
    const nextStartKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      1,
    );

    expect(currentStartKey).toEqual(expect.stringMatching(UUID_PATTERN));
    expect(nextStartKey).toBe(currentStartKey);
  });

  it('does not retire a newer in-flight start intent when abandon recovery resolves', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111124';
    const abandonResult =
      createDeferred<
        Awaited<ReturnType<typeof practiceController.endPracticeSession>>
      >();
    const startResult =
      createDeferred<
        Awaited<ReturnType<typeof practiceController.startPracticeSession>>
      >();
    arrangeControlDependencies();
    getIncompletePracticeSession
      .mockResolvedValueOnce(
        ok({
          sessionId,
          mode: 'tutor',
          answeredCount: 0,
          totalCount: 20,
          startedAt: '2026-07-14T00:00:00.000Z',
        }),
      )
      .mockResolvedValue(ok(null));
    endPracticeSession.mockImplementation(() => abandonResult.promise);
    startPracticeSession.mockImplementation(() => startResult.promise);

    const screen = await render(<RecoveryHookProbe />);
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(sessionId);

    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();
    await vi.waitFor(() => expect(endPracticeSession).toHaveBeenCalledTimes(1));

    await screen.getByRole('button', { name: 'change-start-intent' }).click();
    await screen.getByRole('button', { name: 'start-session' }).click();
    await vi.waitFor(() =>
      expect(startPracticeSession).toHaveBeenCalledTimes(1),
    );
    await expect
      .element(screen.getByTestId('session-start-status'))
      .toHaveTextContent('loading');

    abandonResult.resolve(
      ok({
        sessionId,
        mode: 'tutor',
        questionCount: 20,
        endedAt: '2026-07-14T01:00:00.000Z',
        totals: {
          answered: 0,
          correct: 0,
          accuracy: 0,
          durationSeconds: 60,
        },
      }),
    );
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(/^$/);

    startResult.resolve(err('VALIDATION_ERROR', 'Start request is invalid'));
    await expect
      .element(screen.getByTestId('session-start-status'))
      .toHaveTextContent('error');
  });
});
