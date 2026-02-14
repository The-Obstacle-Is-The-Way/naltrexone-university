// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePracticeQuestionAnswerFlow } from '@/app/(app)/app/practice/hooks/use-practice-question-answer-flow';
import { renderHook } from '@/src/application/test-helpers/render-hook';

describe('usePracticeQuestionAnswerFlow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', () => {
    const output = renderHook(() =>
      usePracticeQuestionAnswerFlow({
        filters: {
          tagSlugs: [],
          difficulty: null,
          status: 'unanswered',
        },
        isMounted: () => true,
        getNextQuestionFn: vi.fn(async () => ({
          ok: true as const,
          data: null,
        })),
        submitAnswerFn: vi.fn(async () => ({
          ok: true as const,
          data: {
            attemptId: 'attempt-1',
            isCorrect: false,
            correctChoiceId: 'choice-1',
            explanationMd: null,
            choiceExplanations: [],
          },
        })),
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
