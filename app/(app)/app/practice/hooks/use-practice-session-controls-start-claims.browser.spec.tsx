import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { Button } from '@/components/ui/button';
import * as reportClientError from '@/lib/report-client-error';
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

function StartClaimProbe() {
  const output = usePracticeSessionControls();
  const [settledStarts, setSettledStarts] = useState(0);

  return (
    <>
      <div data-testid="incomplete-load-status">
        {output.incompleteSessionStatus}
      </div>
      <div data-testid="incomplete-session-id">
        {output.incompleteSession?.sessionId ?? ''}
      </div>
      <div data-testid="settled-starts">{settledStarts}</div>
      <Button
        type="button"
        onClick={() => {
          void output.onStartSession().finally(() => {
            setSettledStarts((count) => count + 1);
          });
        }}
      >
        start-session
      </Button>
      <Button
        type="button"
        onClick={() => {
          void output.onAbandonIncompleteSession();
        }}
      >
        abandon-incomplete-session
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

describe('usePracticeSessionControls start-claim ordering (browser)', () => {
  afterEach(() => {
    vi.resetAllMocks();
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

    const screen = await render(<StartClaimProbe />);
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
    await expect
      .element(screen.getByTestId('settled-starts'))
      .toHaveTextContent('1');

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
    await expect
      .element(screen.getByTestId('settled-starts'))
      .toHaveTextContent('2');

    const refreshCountBeforeThirdSettlement =
      getIncompletePracticeSession.mock.calls.length;
    thirdSettledResult.resolve(err('INTERNAL_ERROR', 'Recorded start failed'));
    await thirdSettledResult.promise;
    await vi.waitFor(() =>
      expect(getIncompletePracticeSession).toHaveBeenCalledTimes(
        refreshCountBeforeThirdSettlement + 1,
      ),
    );
    await expect
      .element(screen.getByTestId('settled-starts'))
      .toHaveTextContent('3');
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

    const screen = await render(<StartClaimProbe />);
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
    await expect
      .element(screen.getByTestId('settled-starts'))
      .toHaveTextContent('1');

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
    await expect
      .element(screen.getByTestId('settled-starts'))
      .toHaveTextContent('2');

    const refreshCountBeforeThirdSettlement =
      getIncompletePracticeSession.mock.calls.length;
    thirdSettledResult.resolve(err('INTERNAL_ERROR', 'Recorded start failed'));
    await thirdSettledResult.promise;
    await vi.waitFor(() =>
      expect(getIncompletePracticeSession).toHaveBeenCalledTimes(
        refreshCountBeforeThirdSettlement + 1,
      ),
    );
    await expect
      .element(screen.getByTestId('settled-starts'))
      .toHaveTextContent('3');
  });

  it('preserves the key when a later claim settles before an earlier invocation', async () => {
    const earlierUnsettledResult =
      createDeferred<
        Awaited<ReturnType<typeof practiceController.startPracticeSession>>
      >();
    const laterSettledResult =
      createDeferred<
        Awaited<ReturnType<typeof practiceController.startPracticeSession>>
      >();
    const retryResult =
      createDeferred<
        Awaited<ReturnType<typeof practiceController.startPracticeSession>>
      >();
    arrangeControlDependencies();
    getIncompletePracticeSession.mockResolvedValue(ok(null));
    startPracticeSession
      .mockImplementationOnce(() => earlierUnsettledResult.promise)
      .mockImplementationOnce(() => laterSettledResult.promise)
      .mockImplementationOnce(() => retryResult.promise);

    const screen = await render(<StartClaimProbe />);
    await expect
      .element(screen.getByTestId('incomplete-load-status'))
      .toHaveTextContent('idle');

    await screen.getByRole('button', { name: 'start-session' }).click();
    await screen.getByRole('button', { name: 'start-session' }).click();
    await vi.waitFor(() =>
      expect(startPracticeSession).toHaveBeenCalledTimes(2),
    );
    const preservedKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      0,
    );
    expect(getCallIdempotencyKey(startPracticeSession.mock.calls, 1)).toBe(
      preservedKey,
    );

    const refreshCountBeforeLaterSettlement =
      getIncompletePracticeSession.mock.calls.length;
    laterSettledResult.resolve(
      err('INTERNAL_ERROR', 'Later request released the server claim'),
    );
    await laterSettledResult.promise;
    await vi.waitFor(() =>
      expect(getIncompletePracticeSession).toHaveBeenCalledTimes(
        refreshCountBeforeLaterSettlement + 1,
      ),
    );
    await expect
      .element(screen.getByTestId('settled-starts'))
      .toHaveTextContent('1');

    await screen.getByRole('button', { name: 'start-session' }).click();
    await vi.waitFor(() =>
      expect(startPracticeSession).toHaveBeenCalledTimes(3),
    );
    const retryKey = getCallIdempotencyKey(startPracticeSession.mock.calls, 2);

    try {
      expect(preservedKey).toEqual(expect.stringMatching(UUID_PATTERN));
      expect(retryKey).toBe(preservedKey);
    } finally {
      const refreshCountBeforeCleanup =
        getIncompletePracticeSession.mock.calls.length;
      retryResult.resolve(err('INTERNAL_ERROR', 'Retry settled'));
      earlierUnsettledResult.resolve(
        err('INTERNAL_ERROR', 'Earlier request settled'),
      );
      await Promise.all([retryResult.promise, earlierUnsettledResult.promise]);
      await expect
        .element(screen.getByTestId('settled-starts'))
        .toHaveTextContent('3');
      expect(getIncompletePracticeSession.mock.calls.length).toBe(
        refreshCountBeforeCleanup + 2,
      );
    }
  });

  it('preserves uncertainty when a concurrent observation arrives after a pre-existing result', async () => {
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

    const screen = await render(<StartClaimProbe />);
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
    await expect
      .element(screen.getByTestId('settled-starts'))
      .toHaveTextContent('2');

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
    await expect
      .element(screen.getByTestId('settled-starts'))
      .toHaveTextContent('3');
    const thirdStartKey = getCallIdempotencyKey(
      startPracticeSession.mock.calls,
      2,
    );

    expect(firstStartKey).toEqual(expect.stringMatching(UUID_PATTERN));
    expect(thirdStartKey).toBe(firstStartKey);
  });
});
