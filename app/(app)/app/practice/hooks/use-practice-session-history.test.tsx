// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/src/adapters/controllers/action-result';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { renderLiveHook } from '@/src/application/test-helpers/render-live-hook';
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
});
