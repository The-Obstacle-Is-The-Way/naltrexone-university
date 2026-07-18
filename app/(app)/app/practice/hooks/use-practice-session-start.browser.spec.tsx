import { useCallback, useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import * as reportClientError from '@/lib/report-client-error';
import { TimeoutError } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { err } from '@/src/adapters/controllers/action-result';
import type { StartPracticeSessionOutput } from '@/src/adapters/controllers/practice-controller';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import { ApplicationConflictReasons } from '@/src/application/errors';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import { installReportClientErrorMocks } from '@/tests/test-helpers/report-client-error-mocks';
import * as clientNavigation from '../client-navigation';
import { IncompleteSessionCard } from '../components/incomplete-session-card';
import { usePracticeIncompleteSession } from './use-practice-incomplete-session';
import { usePracticeSessionStart } from './use-practice-session-start';

const fixtureSession1Id = crypto.randomUUID();

vi.mock('@/src/adapters/controllers/practice-controller', { spy: true });
vi.mock('@/lib/report-client-error', { spy: true });
vi.mock('../client-navigation', { spy: true });

const startPracticeSession = vi.mocked(practiceController.startPracticeSession);
const getIncompletePracticeSession = vi.mocked(
  practiceController.getIncompletePracticeSession,
);
const reportClientErrorSpy = vi.mocked(reportClientError.reportClientError);
const navigateToSpy = vi.mocked(clientNavigation.navigateTo);
const refreshIncompleteSession = async () => ({
  kind: 'loaded' as const,
  session: null,
});

installReportClientErrorMocks(reportClientError);

function getIdempotencyKey(input: unknown): string {
  if (!input || typeof input !== 'object') {
    throw new Error('Expected startPracticeSession to receive an input object');
  }

  const key = (input as Record<string, unknown>).idempotencyKey;
  if (typeof key !== 'string') {
    throw new Error('Expected startPracticeSession to receive idempotencyKey');
  }

  return key;
}

function Probe() {
  const isMounted = useCallback(() => true, []);
  const output = usePracticeSessionStart({
    isMounted,
    refreshIncompleteSession,
  });
  const [settledStarts, setSettledStarts] = useState(0);
  const sessionStartError =
    output.sessionStartStatus === 'error'
      ? (output.sessionStartError ?? '')
      : '';

  return (
    <>
      <div data-testid="status">{output.filters.status}</div>
      <div data-testid="session-start-status">{output.sessionStartStatus}</div>
      <div data-testid="session-start-error">{sessionStartError}</div>
      <div data-testid="settled-starts">{settledStarts}</div>
      <button
        type="button"
        data-testid="set-incorrect"
        onClick={() => output.onStatusChange('incorrect')}
      >
        Set incorrect
      </button>
      <button
        type="button"
        data-testid="start"
        onClick={() => {
          void output.onStartSession().finally(() => {
            setSettledStarts((count) => count + 1);
          });
        }}
      >
        Start
      </button>
    </>
  );
}

function RecoveryProbe() {
  const isMounted = useCallback(() => true, []);
  const incomplete = usePracticeIncompleteSession({ isMounted });
  const sessionStart = usePracticeSessionStart({
    isMounted,
    refreshIncompleteSession: incomplete.refreshIncompleteSession,
  });
  const [settledStarts, setSettledStarts] = useState(0);

  if (incomplete.incompleteSession) {
    return (
      <IncompleteSessionCard
        session={incomplete.incompleteSession}
        isPending={incomplete.incompleteSessionStatus === 'loading'}
        onAbandon={() => undefined}
      />
    );
  }

  return (
    <>
      <div data-testid="recovery-settled-starts">{settledStarts}</div>
      <button
        type="button"
        data-testid="recovery-start"
        onClick={() => {
          void sessionStart.onStartSession().finally(() => {
            setSettledStarts((count) => count + 1);
          });
        }}
      >
        Start
      </button>
    </>
  );
}

beforeEach(() => {
  navigateToSpy.mockImplementation(() => undefined);
});

afterEach(() => {
  vi.resetAllMocks();
});

test('rotates the session start idempotency key when changing status', async () => {
  startPracticeSession.mockResolvedValue({
    ok: true,
    data: { sessionId: fixtureSession1Id, requestedCount: 20, actualCount: 20 },
  });

  const screen = await render(<Probe />);

  await screen.getByTestId('start').click();
  await expect.poll(() => startPracticeSession.mock.calls.length).toBe(1);
  const firstKey = getIdempotencyKey(startPracticeSession.mock.calls[0]?.[0]);

  await screen.getByTestId('set-incorrect').click();
  await expect
    .element(screen.getByTestId('status'))
    .toHaveTextContent('incorrect');

  await screen.getByTestId('start').click();
  await expect.poll(() => startPracticeSession.mock.calls.length).toBe(2);
  const secondKey = getIdempotencyKey(startPracticeSession.mock.calls[1]?.[0]);

  expect(secondKey).not.toBe(firstKey);
});

test('reports thrown session start failures', async () => {
  const error = new Error('Network down');
  startPracticeSession.mockRejectedValue(error);

  const screen = await render(<Probe />);

  await screen.getByTestId('start').click();

  await expect.poll(() => reportClientErrorSpy.mock.calls.length).toBe(1);
  expect(reportClientErrorSpy).toHaveBeenCalledWith(error, {
    component: 'UsePracticeSessionStart',
    action: 'startSession',
  });
});

test('reuses the session start key after a timeout and reaches the recorded success', async () => {
  startPracticeSession
    .mockRejectedValueOnce(new TimeoutError(15_000))
    .mockResolvedValueOnce(
      ok({
        sessionId: fixtureSession1Id,
        requestedCount: 20,
        actualCount: 20,
      }),
    );

  const screen = await render(<Probe />);

  await screen.getByTestId('start').click();
  await expect
    .element(screen.getByTestId('session-start-status'))
    .toHaveTextContent('error');
  const firstKey = getIdempotencyKey(startPracticeSession.mock.calls[0]?.[0]);

  await screen.getByTestId('start').click();
  await expect.poll(() => startPracticeSession.mock.calls.length).toBe(2);
  await expect.poll(() => navigateToSpy.mock.calls.length).toBe(1);
  const secondKey = getIdempotencyKey(startPracticeSession.mock.calls[1]?.[0]);

  expect(secondKey).toBe(firstKey);
  expect(navigateToSpy).toHaveBeenCalledWith(
    `/app/practice/${fixtureSession1Id}`,
  );
});

test('retires timeout uncertainty after a causally later retry proves absence', async () => {
  startPracticeSession
    .mockRejectedValueOnce(new TimeoutError(15_000))
    .mockResolvedValue(err('INTERNAL_ERROR', 'Recorded start failed'));

  const screen = await render(<Probe />);

  await screen.getByTestId('start').click();
  await expect
    .element(screen.getByTestId('settled-starts'))
    .toHaveTextContent('1');
  const timedOutKey = getIdempotencyKey(
    startPracticeSession.mock.calls[0]?.[0],
  );

  await screen.getByTestId('start').click();
  await expect
    .element(screen.getByTestId('settled-starts'))
    .toHaveTextContent('2');
  const consumingRetryKey = getIdempotencyKey(
    startPracticeSession.mock.calls[1]?.[0],
  );

  await screen.getByTestId('start').click();
  await expect.poll(() => startPracticeSession.mock.calls.length).toBe(3);
  const nextKey = getIdempotencyKey(startPracticeSession.mock.calls[2]?.[0]);

  expect(consumingRetryKey).toBe(timedOutKey);
  expect(nextKey).not.toBe(timedOutKey);
});

test('recovers a late concurrent start with the preserved key and renders the session panel', async () => {
  const committedSession = {
    sessionId: fixtureSession1Id,
    mode: 'tutor' as const,
    answeredCount: 0,
    totalCount: 20,
    startedAt: '2026-07-15T00:00:00.000Z',
  };
  let originalRequestCommitted = false;

  getIncompletePracticeSession.mockImplementation(async () =>
    ok(originalRequestCommitted ? committedSession : null),
  );
  startPracticeSession
    .mockRejectedValueOnce(new TimeoutError(15_000))
    .mockResolvedValue(
      err('CONFLICT', 'Request is still running', undefined, {
        reason: ApplicationConflictReasons.ConcurrentRequestInProgress,
      }),
    );

  const screen = await render(<RecoveryProbe />);
  await expect
    .poll(() => getIncompletePracticeSession.mock.calls.length)
    .toBe(1);

  await screen.getByTestId('recovery-start').click();
  await expect
    .element(screen.getByTestId('recovery-settled-starts'))
    .toHaveTextContent('1');
  const firstKey = getIdempotencyKey(startPracticeSession.mock.calls[0]?.[0]);

  await screen.getByTestId('recovery-start').click();
  await expect
    .element(screen.getByTestId('recovery-settled-starts'))
    .toHaveTextContent('2');
  const concurrentRetryKey = getIdempotencyKey(
    startPracticeSession.mock.calls[1]?.[0],
  );
  expect(concurrentRetryKey).toBe(firstKey);
  await expect
    .poll(() => getIncompletePracticeSession.mock.calls.length)
    .toBe(2);

  originalRequestCommitted = true;

  await screen.getByTestId('recovery-start').click();
  await expect.poll(() => startPracticeSession.mock.calls.length).toBe(3);
  const recoveryRetryKey = getIdempotencyKey(
    startPracticeSession.mock.calls[2]?.[0],
  );
  expect(recoveryRetryKey).toBe(firstKey);
  await expect
    .element(screen.getByRole('link', { name: 'Resume session' }))
    .toHaveAttribute('href', `/app/practice/${fixtureSession1Id}`);
  await expect
    .element(screen.getByRole('button', { name: 'Abandon session' }))
    .toBeVisible();
});

test('ignores stale successful session starts after config changes mid-flight', async () => {
  const deferred = createDeferred<ActionResult<StartPracticeSessionOutput>>();
  startPracticeSession.mockReturnValue(deferred.promise);

  const screen = await render(<Probe />);

  await screen.getByTestId('start').click();
  await expect
    .element(screen.getByTestId('session-start-status'))
    .toHaveTextContent('loading');

  await screen.getByTestId('set-incorrect').click();
  await expect
    .element(screen.getByTestId('status'))
    .toHaveTextContent('incorrect');

  deferred.resolve(
    ok({ sessionId: fixtureSession1Id, requestedCount: 20, actualCount: 20 }),
  );
  await expect(deferred.promise).resolves.toEqual({
    ok: true,
    data: { sessionId: fixtureSession1Id, requestedCount: 20, actualCount: 20 },
  });
  await expect
    .element(screen.getByTestId('settled-starts'))
    .toHaveTextContent('1');

  expect(navigateToSpy).not.toHaveBeenCalled();
  await expect
    .element(screen.getByTestId('session-start-error'))
    .toHaveTextContent(/^$/);
});

test('ignores stale thrown session start failures after config changes mid-flight', async () => {
  const deferred = createDeferred<ActionResult<StartPracticeSessionOutput>>();
  startPracticeSession.mockReturnValue(deferred.promise);

  const screen = await render(<Probe />);

  await screen.getByTestId('start').click();
  await expect
    .element(screen.getByTestId('session-start-status'))
    .toHaveTextContent('loading');

  await screen.getByTestId('set-incorrect').click();
  await expect
    .element(screen.getByTestId('status'))
    .toHaveTextContent('incorrect');

  deferred.reject(new Error('Stale failure'));
  await expect(deferred.promise).rejects.toThrow('Stale failure');
  await expect
    .element(screen.getByTestId('settled-starts'))
    .toHaveTextContent('1');

  expect(navigateToSpy).not.toHaveBeenCalled();
  expect(reportClientErrorSpy).not.toHaveBeenCalled();
  await expect
    .element(screen.getByTestId('session-start-status'))
    .toHaveTextContent('loading');
  await expect
    .element(screen.getByTestId('session-start-error'))
    .toHaveTextContent(/^$/);
});
