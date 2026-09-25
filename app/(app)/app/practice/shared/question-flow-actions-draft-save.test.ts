import { describe, expect, it, vi } from 'vitest';
import { maybeSaveDraftBeforeNavigation } from '@/app/(app)/app/practice/shared/question-flow-actions';
import type { AsyncLoadStateWithIdle } from '@/app/(app)/app/shared/load-state';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { SaveExamDraftAnswerOutput } from '@/src/adapters/controllers/practice-controller';
import { PracticeSessionConflictReasons } from '@/src/application/errors';
import { ok } from '@/tests/test-helpers/ok';

const fixtureChoice1Id = crypto.randomUUID();
const fixtureChoice2Id = crypto.randomUUID();
const fixtureQuestion1Id = crypto.randomUUID();
const fixtureSession1Id = crypto.randomUUID();

describe('question-flow-actions', () => {
  it('saves an exam draft before navigation when the selection changed', async () => {
    const loadStateTransitions: AsyncLoadStateWithIdle[] = [];
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockResolvedValue(
        ok({
          questionId: fixtureQuestion1Id,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: fixtureChoice2Id,
          draftSavedAt: '2026-02-01T00:00:00.000Z',
          draftCumulativeMs: 50_000,
        }),
      );
    const onSaved = vi.fn();

    const saveResult = await maybeSaveDraftBeforeNavigation({
      sessionId: fixtureSession1Id,
      question: {
        questionId: fixtureQuestion1Id,
        session: {
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 2,
          draftSelectedChoiceId: fixtureChoice1Id,
          draftCumulativeMs: 30_000,
        },
      },
      selectedChoiceId: fixtureChoice2Id,
      currentCumulativeMs: 50_000,
      lastSavedDraftSelectedChoiceId: fixtureChoice1Id,
      lastSavedDraftCumulativeMs: 30_000,
      saveExamDraftAnswerFn,
      setLoadState: (state) => {
        loadStateTransitions.push(state);
      },
      onSaved,
    });

    expect(saveResult).toEqual({ ok: true });
    expect(saveExamDraftAnswerFn).toHaveBeenCalledWith({
      sessionId: fixtureSession1Id,
      questionId: fixtureQuestion1Id,
      selectedChoiceId: fixtureChoice2Id,
      cumulativeMs: 50_000,
    });
    expect(onSaved).toHaveBeenCalledWith({
      questionId: fixtureQuestion1Id,
      selectedChoiceId: fixtureChoice2Id,
      cumulativeMs: 50_000,
    });
    expect(loadStateTransitions).toEqual([]);
  });

  it('saves an exam draft before navigation when only cumulative time advanced', async () => {
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockResolvedValue(
        ok({
          questionId: fixtureQuestion1Id,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: fixtureChoice1Id,
          draftSavedAt: '2026-02-01T00:00:00.000Z',
          draftCumulativeMs: 50_000,
        }),
      );

    const saveResult = await maybeSaveDraftBeforeNavigation({
      sessionId: fixtureSession1Id,
      question: {
        questionId: fixtureQuestion1Id,
        session: {
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 2,
          draftSelectedChoiceId: fixtureChoice1Id,
          draftCumulativeMs: 30_000,
        },
      },
      selectedChoiceId: fixtureChoice1Id,
      currentCumulativeMs: 50_000,
      lastSavedDraftSelectedChoiceId: fixtureChoice1Id,
      lastSavedDraftCumulativeMs: 30_000,
      saveExamDraftAnswerFn,
      setLoadState: () => {},
    });

    expect(saveResult).toEqual({ ok: true });
    expect(saveExamDraftAnswerFn).toHaveBeenCalledWith({
      sessionId: fixtureSession1Id,
      questionId: fixtureQuestion1Id,
      selectedChoiceId: fixtureChoice1Id,
      cumulativeMs: 50_000,
    });
  });

  it('preserves an explicit null draftSelectedChoiceId returned by the server', async () => {
    const onSaved = vi.fn();
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockResolvedValue(
        ok({
          questionId: fixtureQuestion1Id,
          markedForReview: false,
          latestSelectedChoiceId: fixtureChoice2Id,
          latestIsCorrect: true,
          latestAnsweredAt: '2026-02-01T00:00:00.000Z',
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 50_000,
        }),
      );

    const saveResult = await maybeSaveDraftBeforeNavigation({
      sessionId: fixtureSession1Id,
      question: {
        questionId: fixtureQuestion1Id,
        session: {
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 2,
          draftSelectedChoiceId: fixtureChoice1Id,
          draftCumulativeMs: 30_000,
        },
      },
      selectedChoiceId: fixtureChoice2Id,
      currentCumulativeMs: 50_000,
      lastSavedDraftSelectedChoiceId: fixtureChoice1Id,
      lastSavedDraftCumulativeMs: 30_000,
      saveExamDraftAnswerFn,
      setLoadState: () => {},
      onSaved,
    });

    expect(saveResult).toEqual({ ok: true });
    expect(onSaved).toHaveBeenCalledWith({
      questionId: fixtureQuestion1Id,
      selectedChoiceId: null,
      cumulativeMs: 50_000,
    });
  });

  it('persists cumulative time for unanswered exam questions before navigation', async () => {
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockResolvedValue(
        ok({
          questionId: fixtureQuestion1Id,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: null,
          draftSavedAt: '2026-02-01T00:00:00.000Z',
          draftCumulativeMs: 15_000,
        }),
      );
    const onSaved = vi.fn();

    const saveResult = await maybeSaveDraftBeforeNavigation({
      sessionId: fixtureSession1Id,
      question: {
        questionId: fixtureQuestion1Id,
        session: {
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 2,
        },
      },
      selectedChoiceId: null,
      currentCumulativeMs: 15_000,
      lastSavedDraftSelectedChoiceId: null,
      lastSavedDraftCumulativeMs: 0,
      saveExamDraftAnswerFn,
      setLoadState: () => {},
      onSaved,
    });

    expect(saveResult).toEqual({ ok: true });
    expect(saveExamDraftAnswerFn).toHaveBeenCalledWith({
      sessionId: fixtureSession1Id,
      questionId: fixtureQuestion1Id,
      selectedChoiceId: null,
      cumulativeMs: 15_000,
    });
    expect(onSaved).toHaveBeenCalledWith({
      questionId: fixtureQuestion1Id,
      selectedChoiceId: null,
      cumulativeMs: 15_000,
    });
  });

  it('does not save a time-only exam draft when cumulative time did not advance', async () => {
    const saveExamDraftAnswerFn =
      vi.fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >();
    const onSaved = vi.fn();

    const saveResult = await maybeSaveDraftBeforeNavigation({
      sessionId: fixtureSession1Id,
      question: {
        questionId: fixtureQuestion1Id,
        session: {
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 2,
        },
      },
      selectedChoiceId: null,
      currentCumulativeMs: 15_000,
      lastSavedDraftSelectedChoiceId: null,
      lastSavedDraftCumulativeMs: 15_000,
      saveExamDraftAnswerFn,
      setLoadState: () => {},
      onSaved,
    });

    expect(saveResult).toEqual({ ok: true });
    expect(saveExamDraftAnswerFn).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('blocks navigation and sets load error when draft save fails', async () => {
    const loadStates: AsyncLoadStateWithIdle[] = [];
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Draft save failed' },
      });

    const saveResult = await maybeSaveDraftBeforeNavigation({
      sessionId: fixtureSession1Id,
      question: {
        questionId: fixtureQuestion1Id,
        session: {
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 2,
        },
      },
      selectedChoiceId: fixtureChoice1Id,
      currentCumulativeMs: 50_000,
      lastSavedDraftSelectedChoiceId: null,
      lastSavedDraftCumulativeMs: 0,
      saveExamDraftAnswerFn,
      setLoadState: (state) => {
        loadStates.push(state);
      },
    });

    expect(saveResult).toEqual({ ok: false, code: 'INTERNAL_ERROR' });
    expect(loadStates.at(-1)).toEqual({
      status: 'error',
      message: 'Draft save failed',
    });
  });

  it('returns transient draft-save state conflicts without promoting a global load error', async () => {
    const loadStates: AsyncLoadStateWithIdle[] = [];
    const transientNotices: string[] = [];
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockResolvedValue({
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'Practice session state changed concurrently; please retry.',
          details: {
            reason: PracticeSessionConflictReasons.StateChangedConcurrently,
          },
        },
      } as ActionResult<SaveExamDraftAnswerOutput>);

    const saveResult = await maybeSaveDraftBeforeNavigation({
      sessionId: fixtureSession1Id,
      question: {
        questionId: fixtureQuestion1Id,
        session: {
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 2,
        },
      },
      selectedChoiceId: fixtureChoice1Id,
      currentCumulativeMs: 50_000,
      lastSavedDraftSelectedChoiceId: null,
      lastSavedDraftCumulativeMs: 0,
      saveExamDraftAnswerFn,
      setLoadState: (state) => {
        loadStates.push(state);
      },
      onStateChangedConcurrently: () => {
        transientNotices.push('state-changed');
      },
    });

    expect(saveResult).toEqual({
      ok: false,
      code: 'CONFLICT',
      reason: PracticeSessionConflictReasons.StateChangedConcurrently,
    });
    expect(loadStates).toEqual([]);
    expect(transientNotices).toEqual(['state-changed']);
  });

  it('keeps reasonless draft-save conflicts on the generic global load error path', async () => {
    const loadStates: AsyncLoadStateWithIdle[] = [];
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockResolvedValue({
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'Draft save conflicted',
        },
      } as ActionResult<SaveExamDraftAnswerOutput>);

    const saveResult = await maybeSaveDraftBeforeNavigation({
      sessionId: fixtureSession1Id,
      question: {
        questionId: fixtureQuestion1Id,
        session: {
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 2,
        },
      },
      selectedChoiceId: fixtureChoice1Id,
      currentCumulativeMs: 50_000,
      lastSavedDraftSelectedChoiceId: null,
      lastSavedDraftCumulativeMs: 0,
      saveExamDraftAnswerFn,
      setLoadState: (state) => {
        loadStates.push(state);
      },
    });

    expect(saveResult).toEqual({ ok: false, code: 'CONFLICT' });
    expect(loadStates.at(-1)).toEqual({
      status: 'error',
      message: 'Draft save conflicted',
    });
  });

  it('returns a null error code when draft save throws before navigation', async () => {
    const loadStates: AsyncLoadStateWithIdle[] = [];
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockRejectedValue(new Error('Network unavailable'));

    const saveResult = await maybeSaveDraftBeforeNavigation({
      sessionId: fixtureSession1Id,
      question: {
        questionId: fixtureQuestion1Id,
        session: {
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 2,
        },
      },
      selectedChoiceId: fixtureChoice1Id,
      currentCumulativeMs: 50_000,
      lastSavedDraftSelectedChoiceId: null,
      lastSavedDraftCumulativeMs: 0,
      saveExamDraftAnswerFn,
      setLoadState: (state) => {
        loadStates.push(state);
      },
    });

    expect(saveResult).toEqual({ ok: false, code: null });
    expect(loadStates.at(-1)).toEqual({
      status: 'error',
      message: 'Network unavailable',
    });
  });
});
