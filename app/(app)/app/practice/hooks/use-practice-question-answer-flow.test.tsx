// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { usePracticeQuestionAnswerFlow } from './use-practice-question-answer-flow';

describe('usePracticeQuestionAnswerFlow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', () => {
    const output = renderHook(() =>
      usePracticeQuestionAnswerFlow({
        filters: {
          tagSlugs: [],
          difficulties: [],
        },
        isMounted: () => true,
      }),
    );

    expect(output.question).toBeNull();
    expect(output.selectedChoiceId).toBeNull();
    expect(output.submitResult).toBeNull();
    expect(output.loadState).toEqual({ status: 'idle' });
    expect(output.isPending).toBe(false);
    expect(output.canSubmit).toBe(false);
    expect(output.questionAreaRef).toBeDefined();
    expect(typeof output.onTryAgain).toBe('function');
    expect(typeof output.onSubmit).toBe('function');
    expect(typeof output.onSelectChoice).toBe('function');
    expect(typeof output.onNextQuestion).toBe('function');
  });
});
