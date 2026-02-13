// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import {
  getFocusRecoveryTransition,
  usePracticeQuestionFlow,
} from './use-practice-question-flow';

describe('usePracticeQuestionFlow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', () => {
    const output = renderHook(() =>
      usePracticeQuestionFlow({
        filters: { tagSlugs: [], difficulties: [], statuses: [] },
      }),
    );

    expect(output.question).toBeNull();
    expect(output.selectedChoiceId).toBeNull();
    expect(output.submitResult).toBeNull();
    expect(output.loadState).toEqual({ status: 'idle' });
    expect(output.isPending).toBe(false);
    expect(output.bookmarkStatus).toBe('idle');
    expect(output.bookmarkMessage).toBeNull();
    expect(output.bookmarkMessageVersion).toBe(0);
    expect(output.canSubmit).toBe(false);
    expect(output.isBookmarked).toBe(false);
    expect(output.questionAreaRef).toBeDefined();
    expect(typeof output.onTryAgain).toBe('function');
    expect(typeof output.onToggleBookmark).toBe('function');
    expect(typeof output.onSelectChoice).toBe('function');
    expect(typeof output.onSubmit).toBe('function');
    expect(typeof output.onNextQuestion).toBe('function');
  });
});

describe('getFocusRecoveryTransition', () => {
  it('focuses when recovering from error through loading to ready', () => {
    let pendingFocus = false;

    ({ pendingFocus } = getFocusRecoveryTransition({
      status: 'error',
      pendingFocus,
    }));
    expect(pendingFocus).toBe(true);

    ({ pendingFocus } = getFocusRecoveryTransition({
      status: 'loading',
      pendingFocus,
    }));
    expect(pendingFocus).toBe(true);

    const ready = getFocusRecoveryTransition({
      status: 'ready',
      pendingFocus,
    });
    expect(ready.pendingFocus).toBe(false);
    expect(ready.shouldFocus).toBe(true);
  });

  it('focuses when transitioning directly from error to ready', () => {
    let pendingFocus = false;

    ({ pendingFocus } = getFocusRecoveryTransition({
      status: 'error',
      pendingFocus,
    }));
    expect(pendingFocus).toBe(true);

    const ready = getFocusRecoveryTransition({
      status: 'ready',
      pendingFocus,
    });
    expect(ready.pendingFocus).toBe(false);
    expect(ready.shouldFocus).toBe(true);
  });

  it('does not focus when ready was not preceded by an error', () => {
    const ready = getFocusRecoveryTransition({
      status: 'ready',
      pendingFocus: false,
    });

    expect(ready.pendingFocus).toBe(false);
    expect(ready.shouldFocus).toBe(false);
  });
});
