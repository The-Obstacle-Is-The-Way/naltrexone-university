// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/src/adapters/controllers/action-result';
import * as bookmarkController from '@/src/adapters/controllers/bookmark-controller';
import * as questionController from '@/src/adapters/controllers/question-controller';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { renderLiveHook } from '@/src/application/test-helpers/render-live-hook';
import { usePracticeQuestionFlow } from './use-practice-question-flow';

describe('usePracticeQuestionFlow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', () => {
    const output = renderHook(() =>
      usePracticeQuestionFlow({
        filters: { tagSlugs: [], difficulties: [] },
      }),
    );

    expect(output.question).toBeNull();
    expect(output.selectedChoiceId).toBeNull();
    expect(output.submitResult).toBeNull();
    expect(output.loadState).toEqual({ status: 'idle' });
    expect(output.isPending).toBe(false);
    expect(output.bookmarkStatus).toBe('idle');
    expect(output.bookmarkMessage).toBeNull();
    expect(output.canSubmit).toBe(false);
    expect(output.isBookmarked).toBe(false);
    expect(typeof output.onTryAgain).toBe('function');
    expect(typeof output.onToggleBookmark).toBe('function');
    expect(typeof output.onSelectChoice).toBe('function');
    expect(typeof output.onSubmit).toBe('function');
    expect(typeof output.onNextQuestion).toBe('function');
  });

  it('loads question data and transitions to ready state', async () => {
    vi.spyOn(questionController, 'getNextQuestion').mockResolvedValue(
      ok(
        createNextQuestion({
          slug: 'question-1',
          stemMd: 'What is the best next step?',
        }),
      ),
    );
    vi.spyOn(bookmarkController, 'getBookmarks').mockResolvedValue(
      ok({ rows: [] }),
    );

    const harness = renderLiveHook(() =>
      usePracticeQuestionFlow({
        filters: { tagSlugs: [], difficulties: [] },
      }),
    );

    try {
      await harness.waitFor((output) => output.loadState.status === 'ready');

      const output = harness.getCurrent();
      expect(output.question?.questionId).toBe('q_1');
      expect(output.loadState).toEqual({ status: 'ready' });
      expect(output.bookmarkStatus).toBe('idle');
      expect(output.canSubmit).toBe(false);
    } finally {
      harness.unmount();
    }
  });

  it('transitions to error state when question loading throws', async () => {
    vi.spyOn(questionController, 'getNextQuestion').mockRejectedValue(
      new Error('Network down'),
    );
    vi.spyOn(bookmarkController, 'getBookmarks').mockResolvedValue(
      ok({ rows: [] }),
    );

    const harness = renderLiveHook(() =>
      usePracticeQuestionFlow({
        filters: { tagSlugs: [], difficulties: [] },
      }),
    );

    try {
      await harness.waitFor((output) => output.loadState.status === 'error');
      expect(harness.getCurrent().loadState).toEqual({
        status: 'error',
        message: 'Network down',
      });
    } finally {
      harness.unmount();
    }
  });
});
