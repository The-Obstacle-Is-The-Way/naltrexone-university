import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@/src/adapters/controllers/action-result';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import {
  applyBookmarkUpdate,
  getActionResultErrorMessage,
  loadBookmarkedQuestionIds,
  loadNextQuestion,
  submitSelectedAnswer,
  toggleQuestionBookmark,
} from './practice-logic';

describe('practice-logic', () => {
  describe('getActionResultErrorMessage', () => {
    it('returns a helpful message for error ActionResult', () => {
      expect(
        getActionResultErrorMessage({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
        }),
      ).toBe('Internal error');
    });

    it('returns a fallback message for ok ActionResult', () => {
      expect(getActionResultErrorMessage({ ok: true, data: null })).toBe(
        'Unexpected ok result',
      );
    });
  });

  describe('loadNextQuestion', () => {
    it('returns ok with the question when the controller succeeds', async () => {
      const question: NextQuestion = {
        questionId: 'q_1',
        slug: 'q-1',
        stemMd: '#',
        difficulty: 'easy',
        choices: [],
        session: null,
      };

      const getNextQuestionFn = vi.fn(async () => ok(question));

      const result = await loadNextQuestion({ getNextQuestionFn });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.question).toMatchObject({ questionId: 'q_1' });
    });

    it('returns error when the controller fails', async () => {
      const getNextQuestionFn = vi.fn(async () =>
        err('UNSUBSCRIBED', 'Subscription required'),
      );

      const result = await loadNextQuestion({ getNextQuestionFn });

      expect(result).toEqual({
        ok: false,
        message: 'Subscription required',
      });
    });
  });

  describe('loadBookmarkedQuestionIds', () => {
    it('returns a Set of bookmarked question IDs', async () => {
      const getBookmarksFn = vi.fn(async () =>
        ok({
          rows: [{ questionId: 'q_1' }, { questionId: 'q_2' }],
        }),
      );

      const result = await loadBookmarkedQuestionIds({ getBookmarksFn });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect([...result.questionIds]).toEqual(['q_1', 'q_2']);
    });

    it('returns error when the controller fails', async () => {
      const getBookmarksFn = vi.fn(async () =>
        err('INTERNAL_ERROR', 'Internal error'),
      );

      const result = await loadBookmarkedQuestionIds({ getBookmarksFn });

      expect(result).toEqual({ ok: false, message: 'Internal error' });
    });
  });

  describe('submitSelectedAnswer', () => {
    it('returns ok with submit result when the controller succeeds', async () => {
      const submitAnswerFn = vi.fn(async () =>
        ok({
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: 'Because...',
        }),
      );

      const result = await submitSelectedAnswer({
        submitAnswerFn,
        questionId: 'q_1',
        choiceId: 'choice_1',
      });

      expect(result).toMatchObject({ ok: true, data: { isCorrect: true } });
      expect(submitAnswerFn).toHaveBeenCalledWith({
        questionId: 'q_1',
        choiceId: 'choice_1',
      });
    });

    it('returns error when the controller fails', async () => {
      const submitAnswerFn = vi.fn(async () =>
        err('NOT_FOUND', 'Question not found'),
      );

      const result = await submitSelectedAnswer({
        submitAnswerFn,
        questionId: 'q_1',
        choiceId: 'choice_1',
      });

      expect(result).toEqual({ ok: false, message: 'Question not found' });
    });
  });

  describe('toggleQuestionBookmark', () => {
    it('returns ok with bookmark state when the controller succeeds', async () => {
      const toggleBookmarkFn = vi.fn(async () => ok({ bookmarked: true }));

      const result = await toggleQuestionBookmark({
        toggleBookmarkFn,
        questionId: 'q_1',
      });

      expect(result).toEqual({ ok: true, bookmarked: true });
      expect(toggleBookmarkFn).toHaveBeenCalledWith({ questionId: 'q_1' });
    });

    it('returns error when the controller fails', async () => {
      const toggleBookmarkFn = vi.fn(async () =>
        err('INTERNAL_ERROR', 'Internal error'),
      );

      const result = await toggleQuestionBookmark({
        toggleBookmarkFn,
        questionId: 'q_1',
      });

      expect(result).toEqual({ ok: false, message: 'Internal error' });
    });
  });

  describe('applyBookmarkUpdate', () => {
    it('adds or removes the question ID based on bookmarked flag', () => {
      const initial = new Set<string>(['q_1']);

      const added = applyBookmarkUpdate({
        prev: initial,
        questionId: 'q_2',
        bookmarked: true,
      });

      expect([...added]).toEqual(['q_1', 'q_2']);

      const removed = applyBookmarkUpdate({
        prev: added,
        questionId: 'q_1',
        bookmarked: false,
      });

      expect([...removed]).toEqual(['q_2']);
    });
  });
});
