import { z } from 'zod';
import {
  MAX_PAGINATION_LIMIT,
  MAX_PAGINATION_OFFSET,
  MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS,
  MAX_PRACTICE_SESSION_QUESTIONS,
  MAX_PRACTICE_SESSION_TAG_FILTERS,
  MAX_TAG_SLUG_LENGTH,
} from '@/src/adapters/shared/validation-limits';
import { zDifficulty, zUuid } from '@/src/adapters/shared/zod-schemas';

export const zPracticeMode = z.enum(['tutor', 'exam']);

export const StartPracticeSessionInputSchema = z
  .object({
    mode: zPracticeMode,
    count: z.number().int().min(1).max(MAX_PRACTICE_SESSION_QUESTIONS),
    idempotencyKey: zUuid.optional(),
    tagSlugs: z
      .array(z.string().min(1).max(MAX_TAG_SLUG_LENGTH))
      .max(MAX_PRACTICE_SESSION_TAG_FILTERS)
      .default([]),
    difficulties: z
      .array(zDifficulty)
      .max(MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS)
      .default([]),
  })
  .strict();

export const EndPracticeSessionInputSchema = z
  .object({
    sessionId: zUuid,
    idempotencyKey: zUuid.optional(),
  })
  .strict();

export const GetPracticeSessionReviewInputSchema = z
  .object({
    sessionId: zUuid,
  })
  .strict();

export const SetPracticeSessionQuestionMarkInputSchema = z
  .object({
    sessionId: zUuid,
    questionId: zUuid,
    markedForReview: z.boolean(),
    idempotencyKey: zUuid.optional(),
  })
  .strict();

export const GetSessionHistoryInputSchema = z
  .object({
    limit: z.number().int().min(1).max(MAX_PAGINATION_LIMIT),
    offset: z.number().int().min(0).max(MAX_PAGINATION_OFFSET),
  })
  .strict();

export const EmptyInputSchema = z.object({}).strict();

export const StartPracticeSessionOutputSchema = z
  .object({
    sessionId: zUuid,
  })
  .strict();

export const EndPracticeSessionOutputSchema = z
  .object({
    sessionId: zUuid,
    endedAt: z.string().datetime(),
    totals: z
      .object({
        answered: z.number().int().min(0),
        correct: z.number().int().min(0),
        accuracy: z.number().min(0).max(1),
        durationSeconds: z.number().int().min(0),
      })
      .strict()
      .superRefine((totals, ctx) => {
        if (totals.correct > totals.answered) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'correct must be <= answered',
            path: ['correct'],
          });
        }
      }),
  })
  .strict();

export const SetPracticeSessionQuestionMarkOutputSchema = z
  .object({
    questionId: zUuid,
    markedForReview: z.boolean(),
  })
  .strict();

export const GetIncompletePracticeSessionOutputSchema = z
  .object({
    sessionId: zUuid,
    mode: zPracticeMode,
    answeredCount: z.number().int().min(0),
    totalCount: z.number().int().min(1).max(MAX_PRACTICE_SESSION_QUESTIONS),
    startedAt: z.string().datetime(),
  })
  .strict()
  .nullable();
