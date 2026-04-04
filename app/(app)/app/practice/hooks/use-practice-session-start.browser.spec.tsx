import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { StartPracticeSessionOutput } from '@/src/adapters/controllers/practice-controller';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeSessionStart } from './use-practice-session-start';

const { startPracticeSessionMock, navigateToMock, reportClientErrorMock } =
  vi.hoisted(() => ({
    startPracticeSessionMock: vi.fn(),
    navigateToMock: vi.fn(),
    reportClientErrorMock: vi.fn(),
  }));

vi.mock('@/src/adapters/controllers/practice-controller', () => ({
  startPracticeSession: startPracticeSessionMock,
}));

vi.mock('@/lib/report-client-error', () => ({
  reportClientError: reportClientErrorMock,
  shouldReportClientError: () => true,
}));

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

async function flushDeferredSettlement(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

afterEach(() => {
  startPracticeSessionMock.mockReset();
  navigateToMock.mockReset();
  reportClientErrorMock.mockReset();
});

test('rotates the session start idempotency key when changing status', async () => {
  startPracticeSessionMock.mockResolvedValue({
    ok: true,
    data: { sessionId: 'session_1' },
  });

  const screen = await render(<Probe />);

  await screen.getByTestId('start').click();
  await expect.poll(() => startPracticeSessionMock.mock.calls.length).toBe(1);
  const firstKey = getIdempotencyKey(
    startPracticeSessionMock.mock.calls[0]?.[0],
  );

  await screen.getByTestId('set-incorrect').click();
  await expect
    .element(screen.getByTestId('status'))
    .toHaveTextContent('incorrect');

  await screen.getByTestId('start').click();
  await expect.poll(() => startPracticeSessionMock.mock.calls.length).toBe(2);
  const secondKey = getIdempotencyKey(
    startPracticeSessionMock.mock.calls[1]?.[0],
  );

  expect(secondKey).not.toBe(firstKey);
});

test('reports thrown session start failures', async () => {
  const error = new Error('Network down');
  startPracticeSessionMock.mockRejectedValue(error);

  const screen = await render(<Probe />);

  await screen.getByTestId('start').click();

  await expect.poll(() => reportClientErrorMock.mock.calls.length).toBe(1);
  expect(reportClientErrorMock).toHaveBeenCalledWith(error, {
    component: 'UsePracticeSessionStart',
    action: 'startSession',
  });
});

test('ignores stale successful session starts after config changes mid-flight', async () => {
  const deferred = createDeferred<ActionResult<StartPracticeSessionOutput>>();
  startPracticeSessionMock.mockReturnValue(deferred.promise);

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
  startPracticeSessionMock.mockReturnValue(deferred.promise);

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
  expect(reportClientErrorMock).not.toHaveBeenCalled();
  await expect
    .element(screen.getByTestId('session-start-status'))
    .toHaveTextContent('loading');
  await expect
    .element(screen.getByTestId('session-start-error'))
    .toHaveTextContent('');
});
