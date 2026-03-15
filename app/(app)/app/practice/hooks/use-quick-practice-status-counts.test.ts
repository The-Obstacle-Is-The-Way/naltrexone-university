import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@/src/adapters/controllers/action-result';
import {
  createEmptyQuickPracticeStatusCounts,
  createQuickPracticeStatusCountsEffect,
} from './use-quick-practice-status-counts';

describe('useQuickPracticeStatusCounts helpers', () => {
  const baseFilters = {
    tagSlugs: [] as const,
    difficulties: [] as const,
  };

  it('sets loading null counts, then resolved per-status counts', async () => {
    const setCounts = vi.fn();
    const logError = vi.fn();

    const countAvailableQuestionsFn = vi.fn(
      async (input: {
        statuses: readonly ('unanswered' | 'incorrect' | 'bookmarked')[];
      }) => {
        const status = input.statuses[0];
        if (status === 'unanswered') return ok({ count: 11 });
        if (status === 'incorrect') return ok({ count: 4 });
        return ok({ count: 2 });
      },
    );

    createQuickPracticeStatusCountsEffect({
      countAvailableQuestionsFn,
      filters: baseFilters,
      setCounts,
      logError,
    });

    expect(setCounts).toHaveBeenCalledWith(
      createEmptyQuickPracticeStatusCounts(),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(countAvailableQuestionsFn).toHaveBeenCalledTimes(3);
    expect(setCounts).toHaveBeenLastCalledWith({
      unanswered: 11,
      incorrect: 4,
      bookmarked: 2,
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it('falls back to labels-without-counts when any count request returns non-ok', async () => {
    const setCounts = vi.fn();
    const logError = vi.fn();

    const countAvailableQuestionsFn = vi.fn(
      async (input: {
        statuses: readonly ('unanswered' | 'incorrect' | 'bookmarked')[];
      }) => {
        const status = input.statuses[0];
        if (status === 'incorrect') {
          return err('INTERNAL_ERROR', 'failed');
        }
        return ok({ count: 1 });
      },
    );

    createQuickPracticeStatusCountsEffect({
      countAvailableQuestionsFn,
      filters: baseFilters,
      setCounts,
      logError,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(setCounts).toHaveBeenLastCalledWith(
      createEmptyQuickPracticeStatusCounts(),
    );
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      'Failed to count available quick practice questions',
      expect.objectContaining({
        code: 'INTERNAL_ERROR',
        message: 'failed',
      }),
    );
  });

  it('falls back to labels-without-counts when count request throws', async () => {
    const setCounts = vi.fn();
    const logError = vi.fn();

    const countAvailableQuestionsFn = vi.fn(async () => {
      throw new Error('boom');
    });

    createQuickPracticeStatusCountsEffect({
      countAvailableQuestionsFn,
      filters: baseFilters,
      setCounts,
      logError,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(setCounts).toHaveBeenLastCalledWith(
      createEmptyQuickPracticeStatusCounts(),
    );
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('does not log expected business quick-practice count failures', async () => {
    const setCounts = vi.fn();
    const logError = vi.fn();

    const countAvailableQuestionsFn = vi.fn(
      async (input: {
        statuses: readonly ('unanswered' | 'incorrect' | 'bookmarked')[];
      }) => {
        const status = input.statuses[0];
        if (status === 'incorrect') {
          return err('UNAUTHENTICATED', 'Authentication required');
        }
        return ok({ count: 1 });
      },
    );

    createQuickPracticeStatusCountsEffect({
      countAvailableQuestionsFn,
      filters: baseFilters,
      setCounts,
      logError,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(setCounts).toHaveBeenLastCalledWith(
      createEmptyQuickPracticeStatusCounts(),
    );
    expect(logError).not.toHaveBeenCalled();
  });
});
