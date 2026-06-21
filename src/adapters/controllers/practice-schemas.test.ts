import { describe, expect, it } from 'vitest';
import { MAX_DRAFT_CUMULATIVE_MS } from '@/src/adapters/shared/validation-limits';
import {
  FinalizeExamAnswersInputSchema,
  SaveExamDraftAnswerInputSchema,
} from './practice-schemas';

describe('SaveExamDraftAnswerInputSchema', () => {
  it('accepts a nullable selectedChoiceId for time-only exam drafts', () => {
    const input = {
      sessionId: crypto.randomUUID(),
      questionId: crypto.randomUUID(),
      selectedChoiceId: null,
      cumulativeMs: 15_000,
    };

    expect(SaveExamDraftAnswerInputSchema.parse(input)).toEqual(input);
  });

  it('keeps cumulativeMs bounded for time-only exam drafts', () => {
    const result = SaveExamDraftAnswerInputSchema.safeParse({
      sessionId: crypto.randomUUID(),
      questionId: crypto.randomUUID(),
      selectedChoiceId: null,
      cumulativeMs: MAX_DRAFT_CUMULATIVE_MS + 1,
    });

    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.cumulativeMs).toEqual(
      expect.any(Array),
    );
  });

  it('keeps the draft input strict', () => {
    const result = SaveExamDraftAnswerInputSchema.safeParse({
      sessionId: crypto.randomUUID(),
      questionId: crypto.randomUUID(),
      selectedChoiceId: null,
      cumulativeMs: 15_000,
      unexpected: true,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unrecognized_keys',
          keys: ['unexpected'],
        }),
      ]),
    );
  });
});

describe('FinalizeExamAnswersInputSchema', () => {
  it('accepts finalize input without a finalDraftAnswer', () => {
    const input = {
      sessionId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
    };

    expect(FinalizeExamAnswersInputSchema.parse(input)).toEqual(input);
  });

  it('accepts a bounded single-question finalDraftAnswer flush', () => {
    const input = {
      sessionId: crypto.randomUUID(),
      finalDraftAnswer: {
        questionId: crypto.randomUUID(),
        selectedChoiceId: crypto.randomUUID(),
        cumulativeMs: 30_000,
      },
    };

    expect(FinalizeExamAnswersInputSchema.parse(input)).toEqual(input);
  });

  it('accepts a nullable selectedChoiceId in the final flush', () => {
    const input = {
      sessionId: crypto.randomUUID(),
      finalDraftAnswer: {
        questionId: crypto.randomUUID(),
        selectedChoiceId: null,
        cumulativeMs: 0,
      },
    };

    expect(FinalizeExamAnswersInputSchema.parse(input)).toEqual(input);
  });

  it('keeps the final flush cumulativeMs bounded', () => {
    const result = FinalizeExamAnswersInputSchema.safeParse({
      sessionId: crypto.randomUUID(),
      finalDraftAnswer: {
        questionId: crypto.randomUUID(),
        selectedChoiceId: null,
        cumulativeMs: MAX_DRAFT_CUMULATIVE_MS + 1,
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects a finalDraftAnswer that is missing the questionId', () => {
    const result = FinalizeExamAnswersInputSchema.safeParse({
      sessionId: crypto.randomUUID(),
      finalDraftAnswer: {
        selectedChoiceId: null,
        cumulativeMs: 0,
      },
    });

    expect(result.success).toBe(false);
  });

  it('keeps the final flush object strict', () => {
    const result = FinalizeExamAnswersInputSchema.safeParse({
      sessionId: crypto.randomUUID(),
      finalDraftAnswer: {
        questionId: crypto.randomUUID(),
        selectedChoiceId: null,
        cumulativeMs: 0,
        unexpected: true,
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unrecognized_keys',
          keys: ['unexpected'],
        }),
      ]),
    );
  });
});
