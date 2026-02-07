// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/src/adapters/controllers/action-result';
import * as bookmarkController from '@/src/adapters/controllers/bookmark-controller';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import * as questionController from '@/src/adapters/controllers/question-controller';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { renderLiveHook } from '@/src/application/test-helpers/render-live-hook';
import { usePracticeSessionPageController } from './use-practice-session-page-controller';

describe('usePracticeSessionPageController', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', () => {
    const output = renderHook(() =>
      usePracticeSessionPageController('session-1'),
    );

    expect(output.sessionInfo).toBeNull();
    expect(output.loadState).toEqual({ status: 'idle' });
    expect(output.question).toBeNull();
    expect(output.selectedChoiceId).toBeNull();
    expect(output.submitResult).toBeNull();
    expect(output.isPending).toBe(false);
    expect(output.bookmarkStatus).toBe('idle');
    expect(output.isBookmarked).toBe(false);
    expect(output.isMarkingForReview).toBe(false);
    expect(output.bookmarkMessage).toBeNull();
    expect(output.canSubmit).toBe(false);
    expect(output.summary).toBeNull();
    expect(output.summaryReview).toBeNull();
    expect(output.summaryReviewLoadState).toEqual({ status: 'idle' });
    expect(output.review).toBeNull();
    expect(output.reviewLoadState).toEqual({ status: 'idle' });
    expect(output.navigator).toBeNull();
    expect(typeof output.onEndSession).toBe('function');
    expect(typeof output.onTryAgain).toBe('function');
    expect(typeof output.onToggleBookmark).toBe('function');
    expect(typeof output.onToggleMarkForReview).toBe('function');
    expect(typeof output.onSelectChoice).toBe('function');
    expect(typeof output.onSubmit).toBe('function');
    expect(typeof output.onNextQuestion).toBe('function');
    expect(typeof output.onNavigateQuestion).toBe('function');
    expect(typeof output.onOpenReviewQuestion).toBe('function');
    expect(typeof output.onFinalizeReview).toBe('function');
  });

  it('loads the current question and allows selecting a choice', async () => {
    vi.spyOn(questionController, 'getNextQuestion').mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'question-1',
        stemMd: 'Question 1',
        difficulty: 'easy',
        choices: [
          {
            id: 'choice_1',
            label: 'A',
            textMd: 'Option A',
            sortOrder: 1,
          },
        ],
        session: {
          sessionId: 'session-1',
          mode: 'tutor',
          index: 0,
          total: 10,
          isMarkedForReview: false,
        },
      }),
    );
    vi.spyOn(bookmarkController, 'getBookmarks').mockResolvedValue(
      ok({ rows: [] }),
    );
    vi.spyOn(practiceController, 'getPracticeSessionReview').mockResolvedValue(
      ok({
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 10,
        answeredCount: 0,
        markedCount: 0,
        rows: [],
      }),
    );

    const harness = renderLiveHook(() =>
      usePracticeSessionPageController('session-1'),
    );

    try {
      await harness.waitFor(
        (output) =>
          output.loadState.status === 'ready' && output.question !== null,
      );
      expect(harness.getCurrent().question?.questionId).toBe('question-1');

      harness.getCurrent().onSelectChoice('choice_1');
      await harness.waitFor((output) => output.selectedChoiceId === 'choice_1');

      expect(harness.getCurrent().canSubmit).toBe(true);
    } finally {
      harness.unmount();
    }
  });
});
