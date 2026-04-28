import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import * as reportClientError from '@/lib/report-client-error';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { StartPracticeSessionOutput } from '@/src/adapters/controllers/practice-controller';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeSessionStart } from './use-practice-session-start';

const { navigateToMock } = vi.hoisted(() => ({
  navigateToMock: vi.fn(),
}));

vi.hoisted(() => {
  Object.assign(globalThis, { process: { env: { NODE_ENV: 'test' } } });
});

vi.mock('@/src/adapters/controllers/practice-controller', { spy: true });
vi.mock('@/lib/report-client-error', { spy: true });

const startPracticeSession = vi.mocked(practiceController.startPracticeSession);
const reportClientErrorSpy = vi.mocked(reportClientError.reportClientError);
const shouldReportClientErrorSpy = vi.mocked(
  reportClientError.shouldReportClientError,
);

vi.mock('../client-navigation', () => ({
  navigateTo: navigateToMock,
}));

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
  const output = usePracticeSessionStart({ isMounted: () => true });
  const sessionStartError =
    output.sessionStartStatus === 'error'
      ? (output.sessionStartError ?? '')
      : '';

  return (
    <>
      <div data-testid="status">{output.filters.status}</div>
      <div data-testid="session-start-status">{output.sessionStartStatus}</div>
      <div data-testid="session-start-error">{sessionStartError}</div>
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
        onClick={() => void output.onStartSession()}
      >
        Start
      </button>
    </>
  );
}

// flushDeferredSettlement yields long enough for deferred promise handlers and
// the resulting React state updates to flush. If this ever flakes, replace the
// heuristic with a condition-based wait or increase the timeout deliberately.
async function flushDeferredSettlement(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

beforeEach(() => {
  reportClientErrorSpy.mockImplementation(() => undefined);
  shouldReportClientErrorSpy.mockReturnValue(true);
});

afterEach(() => {
  vi.resetAllMocks();
});

test('rotates the session start idempotency key when changing status', async () => {
  startPracticeSession.mockResolvedValue({
    ok: true,
    data: { sessionId: 'session_1', requestedCount: 20, actualCount: 20 },
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
    ok({ sessionId: 'session_1', requestedCount: 20, actualCount: 20 }),
  );
  await expect(deferred.promise).resolves.toEqual({
    ok: true,
    data: { sessionId: 'session_1', requestedCount: 20, actualCount: 20 },
  });
  await flushDeferredSettlement();

  expect(navigateToMock).not.toHaveBeenCalled();
  await expect
    .element(screen.getByTestId('session-start-error'))
    .toHaveTextContent('');
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
  await flushDeferredSettlement();

  expect(navigateToMock).not.toHaveBeenCalled();
  expect(reportClientErrorSpy).not.toHaveBeenCalled();
  await expect
    .element(screen.getByTestId('session-start-status'))
    .toHaveTextContent('loading');
  await expect
    .element(screen.getByTestId('session-start-error'))
    .toHaveTextContent('');
});
