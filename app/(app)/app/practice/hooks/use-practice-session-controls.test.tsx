// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/src/adapters/controllers/action-result';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import * as tagController from '@/src/adapters/controllers/tag-controller';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { renderLiveHook } from '@/src/application/test-helpers/render-live-hook';
import { usePracticeSessionControls } from './use-practice-session-controls';

describe('usePracticeSessionControls', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', () => {
    const output = renderHook(() => usePracticeSessionControls());

    expect(output.filters).toEqual({
      tagSlugs: [],
      difficulties: [],
    });
    expect(output.sessionMode).toBe('tutor');
    expect(output.sessionCount).toBe(20);
    expect(output.tagLoadStatus).toBe('loading');
    expect(output.availableTags).toEqual([]);
    expect(output.sessionStartStatus).toBe('idle');
    expect(output.sessionStartError).toBeNull();
    expect(output.incompleteSessionStatus).toBe('loading');
    expect(output.incompleteSessionError).toBeNull();
    expect(output.incompleteSession).toBeNull();
    expect(output.sessionHistoryStatus).toBe('loading');
    expect(output.sessionHistoryError).toBeNull();
    expect(output.sessionHistoryRows).toEqual([]);
    expect(output.selectedHistorySessionId).toBeNull();
    expect(output.selectedHistoryReview).toBeNull();
    expect(output.historyReviewLoadState).toEqual({ status: 'idle' });
    expect(typeof output.onSessionModeChange).toBe('function');
    expect(typeof output.onSessionCountChange).toBe('function');
    expect(typeof output.onToggleTag).toBe('function');
    expect(typeof output.onToggleDifficulty).toBe('function');
    expect(typeof output.onStartSession).toBe('function');
    expect(typeof output.onAbandonIncompleteSession).toBe('function');
    expect(typeof output.onOpenSessionHistory).toBe('function');
  });

  it('loads control data and applies user selections', async () => {
    vi.spyOn(tagController, 'getTags').mockResolvedValue(
      ok({
        rows: [
          {
            id: 'tag_1',
            slug: 'opioids',
            name: 'Opioids',
            kind: 'substance',
          },
        ],
      }),
    );
    vi.spyOn(
      practiceController,
      'getIncompletePracticeSession',
    ).mockResolvedValue(ok(null));
    vi.spyOn(practiceController, 'getSessionHistory').mockResolvedValue(
      ok({ rows: [], total: 0, limit: 10, offset: 0 }),
    );

    const harness = renderLiveHook(() => usePracticeSessionControls());

    try {
      await harness.waitFor(
        (output) =>
          output.tagLoadStatus === 'idle' &&
          output.incompleteSessionStatus === 'idle' &&
          output.sessionHistoryStatus === 'idle',
      );

      expect(harness.getCurrent().availableTags).toHaveLength(1);

      harness.getCurrent().onSessionModeChange('exam');
      await harness.waitFor((output) => output.sessionMode === 'exam');

      harness.getCurrent().onToggleTag('opioids');
      await harness.waitFor((output) =>
        output.filters.tagSlugs.includes('opioids'),
      );
    } finally {
      harness.unmount();
    }
  });

  it('ignores unsupported session mode changes', async () => {
    vi.spyOn(tagController, 'getTags').mockResolvedValue(ok({ rows: [] }));
    vi.spyOn(
      practiceController,
      'getIncompletePracticeSession',
    ).mockResolvedValue(ok(null));
    vi.spyOn(practiceController, 'getSessionHistory').mockResolvedValue(
      ok({ rows: [], total: 0, limit: 10, offset: 0 }),
    );

    const harness = renderLiveHook(() => usePracticeSessionControls());
    try {
      await harness.waitFor((output) => output.tagLoadStatus === 'idle');
      harness.getCurrent().onSessionModeChange('invalid-mode');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(harness.getCurrent().sessionMode).toBe('tutor');
    } finally {
      harness.unmount();
    }
  });
});
