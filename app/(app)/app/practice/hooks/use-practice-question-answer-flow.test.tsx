// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePracticeQuestionAnswerFlow } from '@/app/(app)/app/practice/hooks/use-practice-question-answer-flow';
import type { PracticeFilters } from '@/app/(app)/app/practice/practice-page-logic';
import { renderHook } from '@/src/application/test-helpers/render-hook';

const { fixtureAttempt1Id, fixtureChoice1Id } = vi.hoisted(() => ({
  fixtureAttempt1Id: crypto.randomUUID(),
  fixtureChoice1Id: crypto.randomUUID(),
}));

const TEST_FILTERS = {
  tagSlugs: [],
  difficulty: null,
  status: 'unanswered',
} satisfies PracticeFilters;

describe('usePracticeQuestionAnswerFlow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', () => {
    const output = renderHook(() =>
      usePracticeQuestionAnswerFlow({
        filters: TEST_FILTERS,
        isMounted: () => true,
        getNextQuestionFn: vi.fn(async () => ({
          ok: true as const,
          data: null,
        })),
        submitAnswerFn: vi.fn(async () => ({
          ok: true as const,
          data: {
            attemptId: fixtureAttempt1Id,
            isCorrect: false,
            correctChoiceId: fixtureChoice1Id,
            explanationMd: null,
            referenceMd: null,
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

  it('guards programmatic onSubmit while still in the initial idle state', async () => {
    const submitAnswerFn = vi.fn(async () => ({
      ok: true as const,
      data: {
        attemptId: fixtureAttempt1Id,
        isCorrect: false,
        correctChoiceId: fixtureChoice1Id,
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      },
    }));

    const output = renderHook(() =>
      usePracticeQuestionAnswerFlow({
        filters: TEST_FILTERS,
        isMounted: () => true,
        getNextQuestionFn: vi.fn(async () => ({
          ok: true as const,
          data: null,
        })),
        submitAnswerFn,
      }),
    );

    // Pin the schedule we are testing: synchronous renderHook does not run
    // useEffect, so autoload never fires and these preconditions are stable.
    expect(output.loadState).toEqual({ status: 'idle' });
    expect(output.question).toBeNull();
    expect(output.isPending).toBe(false);
    expect(output.canSubmit).toBe(false);

    await output.onSubmit();

    expect(submitAnswerFn).not.toHaveBeenCalled();
  });
});
