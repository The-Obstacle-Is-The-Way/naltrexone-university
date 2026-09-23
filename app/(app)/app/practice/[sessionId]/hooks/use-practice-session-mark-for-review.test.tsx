// @vitest-environment jsdom

import { beforeAll, describe, expect, it } from 'vitest';
import { ok } from '@/src/adapters/controllers/action-result';
import { renderHook } from '@/src/application/test-helpers/render-hook';

let usePracticeSessionMarkForReview: typeof import('./use-practice-session-mark-for-review').usePracticeSessionMarkForReview;

beforeAll(async () => {
  ({ usePracticeSessionMarkForReview } = await import(
    './use-practice-session-mark-for-review'
  ));
});

describe('usePracticeSessionMarkForReview', () => {
  it('returns the expected initial state contract', async () => {
    const output = renderHook(() =>
      usePracticeSessionMarkForReview({
        question: null,
        sessionMode: null,
        sessionInfo: null,
        sessionId: crypto.randomUUID(),
        applySessionInfo: () => undefined,
        setLoadState: () => undefined,
        setReview: () => undefined,
        isMounted: () => true,
        setPracticeSessionQuestionMarkFn: async () =>
          ok({
            questionId: crypto.randomUUID(),
            markedForReview: false,
          }),
      }),
    );

    expect(output.isMarkingForReview).toBe(false);
    expect(typeof output.onToggleMarkForReview).toBe('function');

    await expect(output.onToggleMarkForReview()).resolves.toBeUndefined();
  });
});
