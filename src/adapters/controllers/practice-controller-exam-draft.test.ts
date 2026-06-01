import { describe, expect, it } from 'vitest';
import { MAX_DRAFT_CUMULATIVE_MS } from '@/src/adapters/shared/validation-limits';
import { ApplicationError } from '@/src/application/errors';
import { saveExamDraftAnswer } from './practice-controller';
import { createDeps } from './practice-controller-test-helpers';

describe('practice-controller', () => {
  describe('saveExamDraftAnswer', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await saveExamDraftAnswer(
        {
          sessionId: 'bad',
          questionId: 'still-bad',
          selectedChoiceId: 'also-bad',
          cumulativeMs: -1,
        },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: {
            sessionId: expect.any(Array),
            questionId: expect.any(Array),
            selectedChoiceId: expect.any(Array),
            cumulativeMs: expect.any(Array),
          },
        },
      });
      expect(deps.saveExamDraftAnswerUseCase.inputs).toEqual([]);
    });

    it('returns VALIDATION_ERROR when cumulativeMs exceeds the draft maximum', async () => {
      const deps = createDeps();

      const result = await saveExamDraftAnswer(
        {
          sessionId: '11111111-1111-1111-1111-111111111111',
          questionId: '22222222-2222-2222-2222-222222222222',
          selectedChoiceId: '33333333-3333-3333-3333-333333333333',
          cumulativeMs: MAX_DRAFT_CUMULATIVE_MS + 1,
        },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: {
            cumulativeMs: expect.any(Array),
          },
        },
      });
      expect(deps.saveExamDraftAnswerUseCase.inputs).toEqual([]);
    });

    it('accepts cumulativeMs at the draft maximum boundary', async () => {
      const saveDraftOutput = {
        questionId: '22222222-2222-2222-2222-222222222222',
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: new Date('2026-02-01T00:00:10.000Z'),
        draftSelectedChoiceId: '33333333-3333-3333-3333-333333333333',
        draftSavedAt: new Date('2026-02-01T00:00:00.000Z'),
        draftCumulativeMs: MAX_DRAFT_CUMULATIVE_MS,
      } as const;
      const deps = createDeps({ saveDraftOutput });
      const expectedOutput = {
        ...saveDraftOutput,
        latestAnsweredAt: '2026-02-01T00:00:10.000Z',
        draftSavedAt: '2026-02-01T00:00:00.000Z',
      };

      const result = await saveExamDraftAnswer(
        {
          sessionId: '11111111-1111-1111-1111-111111111111',
          questionId: '22222222-2222-2222-2222-222222222222',
          selectedChoiceId: '33333333-3333-3333-3333-333333333333',
          cumulativeMs: MAX_DRAFT_CUMULATIVE_MS,
        },
        deps,
      );

      expect(result).toEqual({ ok: true, data: expectedOutput });
      expect(deps.saveExamDraftAnswerUseCase.inputs).toEqual([
        {
          userId: deps._fixtures.userId,
          sessionId: '11111111-1111-1111-1111-111111111111',
          questionId: '22222222-2222-2222-2222-222222222222',
          selectedChoiceId: '33333333-3333-3333-3333-333333333333',
          cumulativeMs: MAX_DRAFT_CUMULATIVE_MS,
        },
      ]);
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await saveExamDraftAnswer(
        {
          sessionId: '11111111-1111-1111-1111-111111111111',
          questionId: '22222222-2222-2222-2222-222222222222',
          selectedChoiceId: '33333333-3333-3333-3333-333333333333',
          cumulativeMs: 30_000,
        },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.saveExamDraftAnswerUseCase.inputs).toEqual([]);
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await saveExamDraftAnswer(
        {
          sessionId: '11111111-1111-1111-1111-111111111111',
          questionId: '22222222-2222-2222-2222-222222222222',
          selectedChoiceId: '33333333-3333-3333-3333-333333333333',
          cumulativeMs: 30_000,
        },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.saveExamDraftAnswerUseCase.inputs).toEqual([]);
    });

    it('returns saved draft state when use case succeeds', async () => {
      const saveDraftOutput = {
        questionId: '22222222-2222-2222-2222-222222222222',
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: new Date('2026-02-01T00:00:10.000Z'),
        draftSelectedChoiceId: '33333333-3333-3333-3333-333333333333',
        draftSavedAt: new Date('2026-02-01T00:00:00.000Z'),
        draftCumulativeMs: 50_000,
      } as const;

      const deps = createDeps({ saveDraftOutput });
      const expectedOutput = {
        ...saveDraftOutput,
        latestAnsweredAt: '2026-02-01T00:00:10.000Z',
        draftSavedAt: '2026-02-01T00:00:00.000Z',
      };

      const result = await saveExamDraftAnswer(
        {
          sessionId: '11111111-1111-1111-1111-111111111111',
          questionId: '22222222-2222-2222-2222-222222222222',
          selectedChoiceId: '33333333-3333-3333-3333-333333333333',
          cumulativeMs: 50_000,
        },
        deps,
      );

      expect(result).toEqual({ ok: true, data: expectedOutput });
      expect(deps.saveExamDraftAnswerUseCase.inputs).toEqual([
        {
          userId: deps._fixtures.userId,
          sessionId: '11111111-1111-1111-1111-111111111111',
          questionId: '22222222-2222-2222-2222-222222222222',
          selectedChoiceId: '33333333-3333-3333-3333-333333333333',
          cumulativeMs: 50_000,
        },
      ]);
    });

    it('surfaces expired exam draft saves as a CONFLICT ActionResult', async () => {
      const deps = createDeps({
        saveDraftThrows: new ApplicationError(
          'CONFLICT',
          'Exam time has expired',
        ),
      });

      const result = await saveExamDraftAnswer(
        {
          sessionId: '11111111-1111-1111-1111-111111111111',
          questionId: '22222222-2222-2222-2222-222222222222',
          selectedChoiceId: '33333333-3333-3333-3333-333333333333',
          cumulativeMs: 50_000,
        },
        deps,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'CONFLICT', message: 'Exam time has expired' },
      });
    });

    it('returns VALIDATION_ERROR when the saved draft payload is malformed', async () => {
      const deps = createDeps({
        saveDraftOutput: {
          questionId: '22222222-2222-2222-2222-222222222222',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: '33333333-3333-3333-3333-333333333333',
          draftSavedAt: new Date('2026-02-01T00:00:00.000Z'),
          draftCumulativeMs: -1,
        },
      });

      const result = await saveExamDraftAnswer(
        {
          sessionId: '11111111-1111-1111-1111-111111111111',
          questionId: '22222222-2222-2222-2222-222222222222',
          selectedChoiceId: '33333333-3333-3333-3333-333333333333',
          cumulativeMs: 50_000,
        },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    });
  });
});
