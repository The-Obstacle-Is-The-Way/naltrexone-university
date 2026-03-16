import { describe, expect, it, vi } from 'vitest';
import { err } from '@/src/adapters/controllers/action-result';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import { toggleBookmarkForQuestion } from './bookmark-toggle';

describe('bookmark-toggle', () => {
  describe('toggleBookmarkForQuestion', () => {
    it('persists a generated idempotency key before the request and does not rotate it after failure', async () => {
      const events: string[] = [];
      const createIdempotencyKey = vi
        .fn<() => string>()
        .mockReturnValueOnce('idem_1')
        .mockReturnValueOnce('idem_2');
      const setBookmarkIdempotencyKey = vi.fn((key: string) => {
        events.push(`persist:${key}`);
      });
      const toggleBookmarkFn = vi.fn(async (input: unknown) => {
        events.push(
          `request:${(input as { idempotencyKey?: string }).idempotencyKey ?? 'missing'}`,
        );
        return err('INTERNAL_ERROR', 'Boom');
      });

      await toggleBookmarkForQuestion({
        question: createNextQuestion(),
        createIdempotencyKey,
        setBookmarkIdempotencyKey,
        toggleBookmarkFn,
        setBookmarkStatus: vi.fn(),
        setBookmarkedQuestionIds: vi.fn(),
      });

      expect(events).toEqual(['persist:idem_1', 'request:idem_1']);
      expect(setBookmarkIdempotencyKey).toHaveBeenCalledTimes(1);
      expect(createIdempotencyKey).toHaveBeenCalledTimes(1);
    });
  });
});
