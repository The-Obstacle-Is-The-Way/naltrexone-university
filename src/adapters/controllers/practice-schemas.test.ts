import { describe, expect, it } from 'vitest';
import { MAX_DRAFT_CUMULATIVE_MS } from '@/src/adapters/shared/validation-limits';
import {
  EndPracticeSessionOutputSchema,
  FinalizeExamAnswersInputSchema,
  FinalizeExamAnswersOutputSchema,
  SaveExamDraftAnswerInputSchema,
  StartPracticeSessionInputSchema,
} from './practice-schemas';

// A practice session holds 1 to 200 questions (DEBT-465 Part 3, rule R23).
describe('StartPracticeSessionInputSchema', () => {
  const start = (count: number) =>
    StartPracticeSessionInputSchema.safeParse({
      mode: 'tutor',
      count,
      tagSlugs: [],
      difficulties: [],
    }).success;

  it.each([1, 200])('accepts a session of %i questions', (count) => {
    expect(start(count)).toBe(true);
  });

  it.each([0, 201])('refuses a session of %i questions', (count) => {
    expect(start(count)).toBe(false);
  });
});

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

// DEBT-493 / ADR-022 Decision 3: a session's score counts only its scored
// items. End and finalize outputs are cached by idempotency key for 24 hours,
// so the reader accepts the scored count before any writer sends it
// (deployment-procedure.md, keyed-action output compatibility).
describe('End and finalize outputs: scored totals', () => {
  const output = (totals: Record<string, number>) => ({
    sessionId: crypto.randomUUID(),
    mode: 'exam',
    questionCount: 10,
    endedAt: '2026-10-03T00:00:00.000Z',
    totals: {
      answered: 8,
      correct: 5,
      accuracy: 0.5,
      durationSeconds: 600,
      ...totals,
    },
  });

  it.each([
    ['EndPracticeSessionOutputSchema', EndPracticeSessionOutputSchema],
    ['FinalizeExamAnswersOutputSchema', FinalizeExamAnswersOutputSchema],
  ] as const)('%s reads both cached shapes', (_name, schema) => {
    // A row cached by a writer before scoring: every item counted, so
    // its scored total is the question count.
    expect(schema.parse(output({})).totals).toMatchObject({
      scored: 10,
      correct: 5,
      accuracy: 0.5,
    });
    // A writer that counts only scored items.
    expect(
      schema.parse(output({ scored: 9, accuracy: 5 / 9 })).totals,
    ).toMatchObject({ scored: 9, correct: 5, accuracy: 5 / 9 });
  });

  it.each([
    ['more scored items than questions', { scored: 11 }, 'scored'],
    ['more correct answers than scored items', { scored: 4 }, 'correct'],
  ] as const)('rejects %s', (_case, totals, path) => {
    const result = EndPracticeSessionOutputSchema.safeParse(output(totals));

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.at(-1))).toContain(
      path,
    );
  });

  it('keeps the totals strict', () => {
    expect(
      EndPracticeSessionOutputSchema.safeParse(output({ unscored: 1 })).success,
    ).toBe(false);
  });
});
