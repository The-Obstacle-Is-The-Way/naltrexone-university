// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { usePracticeSessionQuestionFlow } from './use-practice-session-question-flow';

describe('usePracticeSessionQuestionFlow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', () => {
    const output = renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: 'session-1',
        isMounted: () => true,
        getNextQuestionFn: vi.fn(),
        submitAnswerFn: vi.fn(),
      }),
    );

    expect(output.sessionInfo).toBeNull();
    expect(output.sessionMode).toBeNull();
    expect(output.loadState).toEqual({ status: 'idle' });
    expect(output.question).toBeNull();
    expect(output.selectedChoiceId).toBeNull();
    expect(output.submitResult).toBeNull();
    expect(output.isPending).toBe(false);
    expect(output.canSubmit).toBe(false);
    expect(typeof output.applySessionInfo).toBe('function');
    expect(typeof output.onTryAgain).toBe('function');
    expect(typeof output.onNextQuestion).toBe('function');
    expect(typeof output.onSubmit).toBe('function');
    expect(typeof output.onSelectChoice).toBe('function');
    expect(typeof output.onNavigateQuestion).toBe('function');
    expect(typeof output.setSessionMode).toBe('function');
    expect(typeof output.setLoadState).toBe('function');
    expect(typeof output.resetQuestionState).toBe('function');
  });
});
