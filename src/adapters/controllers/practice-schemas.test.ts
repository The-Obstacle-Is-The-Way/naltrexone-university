import { describe, expect, it } from 'vitest';
import { MAX_DRAFT_CUMULATIVE_MS } from '@/src/adapters/shared/validation-limits';
import { SaveExamDraftAnswerInputSchema } from './practice-schemas';

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
