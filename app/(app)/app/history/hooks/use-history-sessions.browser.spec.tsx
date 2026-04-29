import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { render } from 'vitest-browser-react';
import * as reportClientError from '@/lib/report-client-error';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import type { GetPracticeSessionReviewOutput } from '@/src/application/use-cases/get-practice-session-review';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import { useHistorySessions } from './use-history-sessions';

vi.mock('@/src/adapters/controllers/practice-controller', { spy: true });
vi.mock('@/lib/report-client-error', { spy: true });

const getPracticeSessionReview = vi.mocked(
  practiceController.getPracticeSessionReview,
);
const reportClientErrorSpy = vi.mocked(reportClientError.reportClientError);
const shouldReportClientErrorSpy = vi.mocked(
  reportClientError.shouldReportClientError,
);

let shouldReportClientErrorActual: typeof reportClientError.shouldReportClientError;

function makeReviewOutput(sessionId: string): GetPracticeSessionReviewOutput {
  return {
    sessionId,
    mode: 'exam',
    totalCount: 1,
    answeredCount: 1,
    markedCount: 0,
    rows: [
      {
        questionId: 'q1',
        slug: 'q-1',
        order: 1,
        isAvailable: true,
        stemMd: `Stem for ${sessionId}`,
        difficulty: 'easy',
        isAnswered: true,
        isCorrect: false,
        markedForReview: false,
      },
    ],
  };
}

function Probe() {
  const output = useHistorySessions();

  const errorMessage =
    output.reviewLoadState.status === 'error'
      ? output.reviewLoadState.message
      : '';

  return (
    <>
      <div data-testid="session-id">{output.selectedSessionId ?? ''}</div>
      <div data-testid="load-status">{output.reviewLoadState.status}</div>
      <div data-testid="review-session-id">
        {output.selectedReview?.sessionId ?? ''}
      </div>
      <div data-testid="error-message">{errorMessage}</div>
      <button
        type="button"
        data-testid="open-s1"
        onClick={() => void output.onOpenSession('s1')}
      >
        Open s1
      </button>
      <button
        type="button"
        data-testid="open-s2"
        onClick={() => void output.onOpenSession('s2')}
      >
        Open s2
      </button>
    </>
  );
}

describe('useHistorySessions (browser)', () => {
  beforeAll(async () => {
    shouldReportClientErrorActual = (
      await vi.importActual<typeof import('@/lib/report-client-error')>(
        '@/lib/report-client-error',
      )
    ).shouldReportClientError;
  });

  beforeEach(() => {
    reportClientErrorSpy.mockImplementation(() => undefined);
    shouldReportClientErrorSpy.mockImplementation(
      shouldReportClientErrorActual,
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('opens a session and transitions to ready on success', async () => {
    getPracticeSessionReview.mockResolvedValue(ok(makeReviewOutput('s1')));

    const screen = await render(<Probe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('idle');

    await screen.getByTestId('open-s1').click();

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('session-id'))
      .toHaveTextContent('s1');
    await expect
      .element(screen.getByTestId('review-session-id'))
      .toHaveTextContent('s1');
  });

  it('toggles the same session off on second click', async () => {
    getPracticeSessionReview.mockResolvedValue(ok(makeReviewOutput('s1')));

    const screen = await render(<Probe />);

    await screen.getByTestId('open-s1').click();
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    // Click again to toggle off
    await screen.getByTestId('open-s1').click();
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('session-id'))
      .toHaveTextContent('');
    await expect
      .element(screen.getByTestId('review-session-id'))
      .toHaveTextContent('');
  });

  it('transitions to error state when the action result is not ok', async () => {
    const errorResult: ActionResult<GetPracticeSessionReviewOutput> = {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Review load failed' },
    };
    getPracticeSessionReview.mockResolvedValue(errorResult);

    const screen = await render(<Probe />);

    await screen.getByTestId('open-s1').click();

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('error');
    await expect
      .element(screen.getByTestId('error-message'))
      .toHaveTextContent('Review load failed');
    expect(reportClientErrorSpy).toHaveBeenCalledWith(errorResult.error, {
      component: 'UseHistorySessions',
      action: 'openSession',
    });
  });

  it('transitions to error state when the controller throws', async () => {
    const error = new Error('Network failure');
    getPracticeSessionReview.mockRejectedValue(error);

    const screen = await render(<Probe />);

    await screen.getByTestId('open-s1').click();

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('error');
    await expect
      .element(screen.getByTestId('error-message'))
      .toHaveTextContent('Network failure');
    expect(reportClientErrorSpy).toHaveBeenCalledWith(error, {
      component: 'UseHistorySessions',
      action: 'openSession',
    });
  });

  it('discards stale response when same session is closed and reopened', async () => {
    const deferredA =
      createDeferred<ActionResult<GetPracticeSessionReviewOutput>>();
    const deferredB =
      createDeferred<ActionResult<GetPracticeSessionReviewOutput>>();

    getPracticeSessionReview
      .mockReturnValueOnce(deferredA.promise)
      .mockReturnValueOnce(deferredB.promise);

    const screen = await render(<Probe />);

    // Open s1 (request A starts loading)
    await screen.getByTestId('open-s1').click();
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('loading');

    // Close s1 (toggle off)
    await screen.getByTestId('open-s1').click();
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('idle');

    // Reopen s1 (request B starts loading)
    await screen.getByTestId('open-s1').click();
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('loading');

    // Resolve B first with success
    deferredB.resolve(ok(makeReviewOutput('s1')));
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('review-session-id'))
      .toHaveTextContent('s1');

    // Now resolve A with an error — should be discarded, not overwrite success
    deferredA.reject(new Error('Stale network error'));
    await expect(deferredA.promise).rejects.toThrow('Stale network error');

    // State should remain ready (not overwritten by stale error)
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('review-session-id'))
      .toHaveTextContent('s1');
  });

  it('discards stale response when a different session is opened mid-flight', async () => {
    const deferred1 =
      createDeferred<ActionResult<GetPracticeSessionReviewOutput>>();
    const deferred2 =
      createDeferred<ActionResult<GetPracticeSessionReviewOutput>>();

    getPracticeSessionReview
      .mockReturnValueOnce(deferred1.promise)
      .mockReturnValueOnce(deferred2.promise);

    const screen = await render(<Probe />);

    // Open s1 (starts loading)
    await screen.getByTestId('open-s1').click();
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('loading');

    // Open s2 before s1 resolves (race condition)
    await screen.getByTestId('open-s2').click();
    await expect
      .element(screen.getByTestId('session-id'))
      .toHaveTextContent('s2');

    // Resolve s1 (stale — should be discarded)
    deferred1.resolve(ok(makeReviewOutput('s1')));

    // Resolve s2
    deferred2.resolve(ok(makeReviewOutput('s2')));

    // Should show s2's review, not s1's
    await expect
      .element(screen.getByTestId('review-session-id'))
      .toHaveTextContent('s2');
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
  });
});
