// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { usePracticeIncompleteSession } from './use-practice-incomplete-session';

describe('usePracticeIncompleteSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', () => {
    const output = renderHook(() =>
      usePracticeIncompleteSession({
        isMounted: () => true,
      }),
    );

    expect(output.incompleteSessionStatus).toBe('loading');
    expect(output.incompleteSessionError).toBeNull();
    expect(output.incompleteSession).toBeNull();
    expect(typeof output.refreshIncompleteSession).toBe('function');
    expect(typeof output.onAbandonIncompleteSession).toBe('function');
  });
});
