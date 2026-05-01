import { describe, expect, it, vi } from 'vitest';
import {
  createDifficultyChangeHandler,
  createSessionCountBlurHandler,
  createSessionCountChangeHandler,
  createSessionModeChangeHandler,
  createStatusChangeHandler,
  createToggleTagHandler,
  handleSessionCountBlur,
  handleSessionCountChange,
  handleSessionModeChange,
  SESSION_COUNT_MAX,
  SESSION_COUNT_MIN,
} from '@/app/(app)/app/practice/practice-page-logic';

describe('practice-page-logic session handlers', () => {
  describe('handleSessionModeChange', () => {
    it('sets mode only for allowed values', () => {
      const setSessionMode = vi.fn();

      handleSessionModeChange(setSessionMode, { target: { value: 'tutor' } });
      handleSessionModeChange(setSessionMode, { target: { value: 'exam' } });
      handleSessionModeChange(setSessionMode, { target: { value: 'nope' } });

      expect(setSessionMode).toHaveBeenCalledTimes(2);
      expect(setSessionMode).toHaveBeenNthCalledWith(1, 'tutor');
      expect(setSessionMode).toHaveBeenNthCalledWith(2, 'exam');
    });
  });

  describe('handleSessionCountChange', () => {
    it('stores the raw input value and sets the count from numeric input', () => {
      const setSessionCountInputValue = vi.fn();
      const setSessionCount = vi.fn();

      handleSessionCountChange(setSessionCountInputValue, setSessionCount, {
        target: { value: '12' },
      });

      expect(setSessionCountInputValue).toHaveBeenCalledWith('12');
      expect(setSessionCount).toHaveBeenCalledWith(12);
    });

    it('stores the raw input value and clamps finite values within range', () => {
      const setSessionCountInputValue = vi.fn();
      const setSessionCount = vi.fn();

      handleSessionCountChange(setSessionCountInputValue, setSessionCount, {
        target: { value: '0' },
      });
      handleSessionCountChange(setSessionCountInputValue, setSessionCount, {
        target: { value: '-1' },
      });

      expect(setSessionCountInputValue).toHaveBeenNthCalledWith(1, '0');
      expect(setSessionCountInputValue).toHaveBeenNthCalledWith(2, '-1');
      expect(setSessionCount).toHaveBeenNthCalledWith(1, SESSION_COUNT_MIN);
      expect(setSessionCount).toHaveBeenNthCalledWith(2, SESSION_COUNT_MIN);
    });

    it('stores the raw input value and clamps to maximum when value is above range', () => {
      const setSessionCountInputValue = vi.fn();
      const setSessionCount = vi.fn();

      handleSessionCountChange(setSessionCountInputValue, setSessionCount, {
        target: { value: '101' },
      });

      expect(setSessionCountInputValue).toHaveBeenCalledWith('101');
      expect(setSessionCount).toHaveBeenCalledWith(SESSION_COUNT_MAX);
    });

    it('stores raw input without changing the count when the field is cleared or invalid', () => {
      const setSessionCountInputValue = vi.fn();
      const setSessionCount = vi.fn();

      handleSessionCountChange(setSessionCountInputValue, setSessionCount, {
        target: { value: '' },
      });
      handleSessionCountChange(setSessionCountInputValue, setSessionCount, {
        target: { value: 'NaN' },
      });

      expect(setSessionCountInputValue).toHaveBeenNthCalledWith(1, '');
      expect(setSessionCountInputValue).toHaveBeenNthCalledWith(2, 'NaN');
      expect(setSessionCount).not.toHaveBeenCalled();
    });
  });

  describe('handleSessionCountBlur', () => {
    it('resets the raw input string to the canonical numeric count on blur', () => {
      const setSessionCountInputValue = vi.fn();

      handleSessionCountBlur(20, setSessionCountInputValue);

      expect(setSessionCountInputValue).toHaveBeenCalledWith('20');
    });
  });

  describe('practice-page-session-start handlers', () => {
    it('rotates idempotency key when session mode changes', () => {
      const setSessionMode = vi.fn();
      const setIdempotencyKey = vi.fn();
      const handler = createSessionModeChangeHandler({
        setSessionMode,
        setIdempotencyKey,
        createIdempotencyKey: () => 'idem_2',
      });

      handler('exam');

      expect(setSessionMode).toHaveBeenCalledWith('exam');
      expect(setIdempotencyKey).toHaveBeenCalledWith('idem_2');
    });

    it('ignores invalid session mode values', () => {
      const setSessionMode = vi.fn();
      const setIdempotencyKey = vi.fn();
      const handler = createSessionModeChangeHandler({
        setSessionMode,
        setIdempotencyKey,
        createIdempotencyKey: () => 'idem_2',
      });

      handler('nope');

      expect(setSessionMode).not.toHaveBeenCalled();
      expect(setIdempotencyKey).not.toHaveBeenCalled();
    });

    it('rotates idempotency key when session count changes', () => {
      const setSessionCount = vi.fn();
      const setSessionCountInputValue = vi.fn();
      const setIdempotencyKey = vi.fn();
      const handler = createSessionCountChangeHandler({
        setSessionCountInputValue,
        setSessionCount,
        setIdempotencyKey,
        createIdempotencyKey: () => 'idem_2',
      });

      handler({ target: { value: '12' } });

      expect(setSessionCountInputValue).toHaveBeenCalledWith('12');
      expect(setSessionCount).toHaveBeenCalledWith(12);
      expect(setIdempotencyKey).toHaveBeenCalledWith('idem_2');
    });

    it('does not rotate idempotency key when the session count field is cleared', () => {
      const setSessionCount = vi.fn();
      const setSessionCountInputValue = vi.fn();
      const setIdempotencyKey = vi.fn();
      const handler = createSessionCountChangeHandler({
        setSessionCountInputValue,
        setSessionCount,
        setIdempotencyKey,
        createIdempotencyKey: () => 'idem_2',
      });

      handler({ target: { value: '' } });

      expect(setSessionCountInputValue).toHaveBeenCalledWith('');
      expect(setSessionCount).not.toHaveBeenCalled();
      expect(setIdempotencyKey).not.toHaveBeenCalled();
    });

    it('resets the raw input string to the canonical numeric count on blur', () => {
      const setSessionCountInputValue = vi.fn();
      const handler = createSessionCountBlurHandler({
        sessionCount: 20,
        setSessionCountInputValue,
      });

      handler();

      expect(setSessionCountInputValue).toHaveBeenCalledWith('20');
    });

    it('applies tag toggles and rotates idempotency key', () => {
      const setIdempotencyKey = vi.fn();
      const setFilters = vi.fn();
      const handler = createToggleTagHandler({
        setFilters,
        setIdempotencyKey,
        createIdempotencyKey: () => 'idem_2',
      });

      handler('opioids');

      expect(setIdempotencyKey).toHaveBeenCalledWith('idem_2');
      const update = setFilters.mock.calls[0]?.[0];
      if (typeof update !== 'function') {
        throw new Error('Expected setFilters to receive an updater function');
      }

      expect(
        update({ tagSlugs: [], difficulty: null, status: 'unanswered' }),
      ).toEqual({
        tagSlugs: ['opioids'],
        difficulty: null,
        status: 'unanswered',
      });

      expect(
        update({
          tagSlugs: ['opioids'],
          difficulty: 'easy',
          status: 'incorrect',
        }),
      ).toEqual({
        tagSlugs: [],
        difficulty: 'easy',
        status: 'incorrect',
      });
    });

    it('applies difficulty changes and rotates idempotency key', () => {
      const setIdempotencyKey = vi.fn();
      const setFilters = vi.fn();
      const handler = createDifficultyChangeHandler({
        setFilters,
        setIdempotencyKey,
        createIdempotencyKey: () => 'idem_2',
      });

      handler('hard');

      expect(setIdempotencyKey).toHaveBeenCalledWith('idem_2');
      const update = setFilters.mock.calls[0]?.[0];
      if (typeof update !== 'function') {
        throw new Error('Expected setFilters to receive an updater function');
      }

      expect(
        update({ tagSlugs: [], difficulty: null, status: 'unanswered' }),
      ).toEqual({
        tagSlugs: [],
        difficulty: 'hard',
        status: 'unanswered',
      });

      expect(
        update({ tagSlugs: [], difficulty: 'hard', status: 'unanswered' }),
      ).toEqual({
        tagSlugs: [],
        difficulty: 'hard',
        status: 'unanswered',
      });
    });

    it('applies status changes and rotates idempotency key', () => {
      const setIdempotencyKey = vi.fn();
      const setFilters = vi.fn();
      const handler = createStatusChangeHandler({
        setFilters,
        setIdempotencyKey,
        createIdempotencyKey: () => 'idem_2',
      });

      handler('incorrect');

      expect(setIdempotencyKey).toHaveBeenCalledWith('idem_2');
      const update = setFilters.mock.calls[0]?.[0];
      if (typeof update !== 'function') {
        throw new Error('Expected setFilters to receive an updater function');
      }

      expect(
        update({ tagSlugs: [], difficulty: null, status: 'unanswered' }),
      ).toEqual({
        tagSlugs: [],
        difficulty: null,
        status: 'incorrect',
      });

      expect(
        update({ tagSlugs: [], difficulty: null, status: 'incorrect' }),
      ).toEqual({
        tagSlugs: [],
        difficulty: null,
        status: 'incorrect',
      });
    });
  });
});
