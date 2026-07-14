import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import * as reportClientError from '@/lib/report-client-error';
import { TimeoutError } from '@/lib/with-timeout';
import { err } from '@/src/adapters/controllers/action-result';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import * as tagController from '@/src/adapters/controllers/tag-controller';
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

  return (
    <>
      <div data-testid="incomplete-load-status">
        {output.incompleteSessionStatus}
      </div>
      <div data-testid="incomplete-session-id">
        {output.incompleteSession?.sessionId ?? ''}
      </div>
      <button
        type="button"
        onClick={() => {
          void output.onStartSession();
        }}
      >
        start-session
      </button>
      <button
        type="button"
        onClick={() => {
          void output.onAbandonIncompleteSession();
        }}
      >
        abandon-incomplete-session
      </button>
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
});
