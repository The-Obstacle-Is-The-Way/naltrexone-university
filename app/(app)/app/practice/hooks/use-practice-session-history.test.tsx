// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/src/adapters/controllers/action-result';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { renderLiveHook } from '@/src/application/test-helpers/render-live-hook';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { usePracticeSessionHistory } from './use-practice-session-history';

describe('usePracticeSessionHistory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', () => {
    const output = renderHook(() => usePracticeSessionHistory());

    expect(output.sessionHistoryStatus).toBe('loading');
    expect(output.sessionHistoryError).toBeNull();
    expect(output.sessionHistoryRows).toEqual([]);
    expect(output.selectedHistorySessionId).toBeNull();
    expect(output.selectedHistoryReview).toBeNull();
    expect(output.historyReviewLoadState).toEqual({ status: 'idle' });
    expect(typeof output.onOpenSessionHistory).toBe('function');
  });

  it('loads history rows and opens a selected session review', async () => {
    vi.spyOn(practiceController, 'getSessionHistory').mockResolvedValue(
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
    vi.spyOn(practiceController, 'getPracticeSessionReview').mockResolvedValue(
      ok({
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 10,
        answeredCount: 10,
        markedCount: 1,
        rows: [],
      }),
    );

    const harness = renderLiveHook(() => usePracticeSessionHistory());
    try {
      await harness.waitFor((output) => output.sessionHistoryStatus === 'idle');
      expect(harness.getCurrent().sessionHistoryRows).toHaveLength(1);

      await harness.getCurrent().onOpenSessionHistory('session-1');
      await harness.waitFor(
        (output) => output.historyReviewLoadState.status === 'ready',
      );
      expect(harness.getCurrent().selectedHistorySessionId).toBe('session-1');
      expect(harness.getCurrent().selectedHistoryReview?.sessionId).toBe(
        'session-1',
      );
    } finally {
      harness.unmount();
    }
  });

  it('transitions to error when loading history throws', async () => {
    vi.spyOn(practiceController, 'getSessionHistory').mockRejectedValue(
      new Error('History fetch failed'),
    );

    const harness = renderLiveHook(() => usePracticeSessionHistory());
    try {
      await harness.waitFor(
        (output) => output.sessionHistoryStatus === 'error',
      );
      expect(harness.getCurrent().sessionHistoryError).toBe(
        'History fetch failed',
      );
    } finally {
      harness.unmount();
    }
  });

  it('keeps the latest selected session when review responses resolve out of order', async () => {
    const first =
      createDeferred<
        Awaited<ReturnType<typeof practiceController.getPracticeSessionReview>>
      >();
    const second =
      createDeferred<
        Awaited<ReturnType<typeof practiceController.getPracticeSessionReview>>
      >();
    let callCount = 0;

    vi.spyOn(practiceController, 'getSessionHistory').mockResolvedValue(
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
    vi.spyOn(practiceController, 'getPracticeSessionReview').mockImplementation(
      async () => {
        callCount += 1;
        return callCount === 1 ? first.promise : second.promise;
      },
    );

    const harness = renderLiveHook(() => usePracticeSessionHistory());
    try {
      await harness.waitFor((output) => output.sessionHistoryStatus === 'idle');

      const openFirst = harness.getCurrent().onOpenSessionHistory('session-1');
      const openSecond = harness.getCurrent().onOpenSessionHistory('session-2');

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
      await openSecond;

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
      await openFirst;

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(harness.getCurrent().selectedHistorySessionId).toBe('session-2');
      expect(harness.getCurrent().selectedHistoryReview?.sessionId).toBe(
        'session-2',
      );
    } finally {
      harness.unmount();
    }
  });
});
