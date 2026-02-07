import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { usePracticeSessionHistory } from './use-practice-session-history';

const { getSessionHistoryMock, getPracticeSessionReviewMock } = vi.hoisted(
  () => ({
    getSessionHistoryMock: vi.fn(),
    getPracticeSessionReviewMock: vi.fn(),
  }),
);

vi.mock('@/src/adapters/controllers/practice-controller', () => ({
  getSessionHistory: getSessionHistoryMock,
  getPracticeSessionReview: getPracticeSessionReviewMock,
}));

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function PracticeSessionHistoryHookProbe() {
  const output = usePracticeSessionHistory();

  return (
    <>
      <div data-testid="history-status">{output.sessionHistoryStatus}</div>
      <div data-testid="history-error">{output.sessionHistoryError ?? ''}</div>
      <div data-testid="history-count">{output.sessionHistoryRows.length}</div>
      <div data-testid="selected-session-id">
        {output.selectedHistorySessionId ?? ''}
      </div>
      <div data-testid="selected-review-session-id">
        {output.selectedHistoryReview?.sessionId ?? ''}
      </div>
      <div data-testid="review-status">
        {output.historyReviewLoadState.status}
      </div>
      <button
        type="button"
        onClick={() => void output.onOpenSessionHistory('session-1')}
      >
        open-session-1
      </button>
      <button
        type="button"
        onClick={() => void output.onOpenSessionHistory('session-2')}
      >
        open-session-2
      </button>
    </>
  );
}

describe('usePracticeSessionHistory (browser)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads history rows and opens a selected session review', async () => {
    getSessionHistoryMock.mockResolvedValue(
      ok({
        rows: [
          {
            sessionId: 'session-1',
            mode: 'exam',
            questionCount: 10,
            answered: 10,
            correct: 8,
            accuracy: 80,
            durationSeconds: 1200,
            startedAt: '2026-02-07T00:00:00.000Z',
            endedAt: '2026-02-07T00:20:00.000Z',
          },
        ],
        total: 1,
        limit: 10,
        offset: 0,
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 10,
        answeredCount: 10,
        markedCount: 1,
        rows: [],
      }),
    );

    const screen = await render(<PracticeSessionHistoryHookProbe />);

    await expect
      .element(screen.getByTestId('history-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('history-count'))
      .toHaveTextContent('1');

    await screen.getByRole('button', { name: 'open-session-1' }).click();
    await expect
      .element(screen.getByTestId('review-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('selected-session-id'))
      .toHaveTextContent('session-1');
    await expect
      .element(screen.getByTestId('selected-review-session-id'))
      .toHaveTextContent('session-1');
  });

  it('transitions to error when loading history throws', async () => {
    getSessionHistoryMock.mockRejectedValue(new Error('History fetch failed'));

    const screen = await render(<PracticeSessionHistoryHookProbe />);

    await expect
      .element(screen.getByTestId('history-status'))
      .toHaveTextContent('error');
    await expect
      .element(screen.getByTestId('history-error'))
      .toHaveTextContent('History fetch failed');
  });

  it('keeps the latest selected session when review responses resolve out of order', async () => {
    const first = createDeferred<{
      ok: true;
      data: {
        sessionId: string;
        mode: 'exam';
        totalCount: number;
        answeredCount: number;
        markedCount: number;
        rows: [];
      };
    }>();
    const second = createDeferred<{
      ok: true;
      data: {
        sessionId: string;
        mode: 'exam';
        totalCount: number;
        answeredCount: number;
        markedCount: number;
        rows: [];
      };
    }>();
    let callCount = 0;

    getSessionHistoryMock.mockResolvedValue(
      ok({
        rows: [
          {
            sessionId: 'session-1',
            mode: 'exam',
            questionCount: 10,
            answered: 10,
            correct: 7,
            accuracy: 70,
            durationSeconds: 1200,
            startedAt: '2026-02-07T00:00:00.000Z',
            endedAt: '2026-02-07T00:20:00.000Z',
          },
          {
            sessionId: 'session-2',
            mode: 'exam',
            questionCount: 12,
            answered: 12,
            correct: 10,
            accuracy: 83.33,
            durationSeconds: 1500,
            startedAt: '2026-02-07T01:00:00.000Z',
            endedAt: '2026-02-07T01:25:00.000Z',
          },
        ],
        total: 2,
        limit: 10,
        offset: 0,
      }),
    );
    getPracticeSessionReviewMock.mockImplementation(async () => {
      callCount += 1;
      return callCount === 1 ? first.promise : second.promise;
    });

    const screen = await render(<PracticeSessionHistoryHookProbe />);

    await expect
      .element(screen.getByTestId('history-status'))
      .toHaveTextContent('idle');

    await screen.getByRole('button', { name: 'open-session-1' }).click();
    await screen.getByRole('button', { name: 'open-session-2' }).click();

    second.resolve(
      ok({
        sessionId: 'session-2',
        mode: 'exam',
        totalCount: 12,
        answeredCount: 12,
        markedCount: 0,
        rows: [],
      }),
    );
    first.resolve(
      ok({
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 10,
        answeredCount: 10,
        markedCount: 0,
        rows: [],
      }),
    );

    await expect
      .element(screen.getByTestId('selected-session-id'))
      .toHaveTextContent('session-2');
    await expect
      .element(screen.getByTestId('selected-review-session-id'))
      .toHaveTextContent('session-2');
  });
});
