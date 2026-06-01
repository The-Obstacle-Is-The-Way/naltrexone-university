import { z } from 'zod';
import {
  MAX_DRAFT_CUMULATIVE_MS,
  MAX_PAGINATION_LIMIT,
  MAX_PAGINATION_OFFSET,
  MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS,
  MAX_PRACTICE_SESSION_QUESTIONS,
  MAX_PRACTICE_SESSION_TAG_FILTERS,
  MAX_TAG_SLUG_LENGTH,
} from '@/src/adapters/shared/validation-limits';
import {
  zDifficulty,
  zQuestionProgressStatus,
  zUuid,
} from '@/src/adapters/shared/zod-schemas';
import { AllQuestionProgressStatuses } from '@/src/domain/value-objects';

export const zPracticeMode = z.enum(['tutor', 'exam']);

const PracticeFiltersSchema = z.object({
  tagSlugs: z
    .array(z.string().min(1).max(MAX_TAG_SLUG_LENGTH))
    .max(MAX_PRACTICE_SESSION_TAG_FILTERS)
    .default([]),
  difficulties: z
    .array(zDifficulty)
    .max(MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS)
    .default([]),
  statuses: z
    .array(zQuestionProgressStatus)
    .max(AllQuestionProgressStatuses.length)
    .default([]),
});

export const StartPracticeSessionInputSchema = z
  .object({
    mode: zPracticeMode,
    count: z.number().int().min(1).max(MAX_PRACTICE_SESSION_QUESTIONS),
    idempotencyKey: zUuid.optional(),
  })
  .merge(PracticeFiltersSchema)
  .strict();

export const CountAvailableQuestionsInputSchema =
  PracticeFiltersSchema.strict();

export const EndPracticeSessionInputSchema = z
  .object({
    sessionId: zUuid,
    idempotencyKey: zUuid.optional(),
  })
  .strict();

export const FinalizeExamAnswersInputSchema = EndPracticeSessionInputSchema;

export const SaveExamDraftAnswerInputSchema = z
  .object({
    sessionId: zUuid,
    questionId: zUuid,
    selectedChoiceId: zUuid,
    cumulativeMs: z.number().int().min(0).max(MAX_DRAFT_CUMULATIVE_MS),
  })
  .strict();

export const GetPracticeSessionReviewInputSchema = z
  .object({
    sessionId: zUuid,
  })
  .strict();

export const GetCompletedSessionQuestionsWithFeedbackInputSchema = z
  .object({
    sessionId: zUuid,
  })
  .strict();

export const GetPracticeSessionSummaryInputSchema = z
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
    mode: zPracticeMode.optional(),
  })
  .strict();

export const EmptyInputSchema = z.object({}).strict();

export const StartPracticeSessionOutputSchema = z
  .object({
    sessionId: zUuid,
    requestedCount: z.number().int().min(1).max(MAX_PRACTICE_SESSION_QUESTIONS),
    actualCount: z.number().int().min(1).max(MAX_PRACTICE_SESSION_QUESTIONS),
  })
  .strict();

export const CountAvailableQuestionsOutputSchema = z
  .object({
    count: z.number().int().min(0),
  })
  .strict();

export const EndPracticeSessionOutputSchema = z
  .object({
    sessionId: zUuid,
    mode: zPracticeMode,
    questionCount: z.number().int().min(0).max(MAX_PRACTICE_SESSION_QUESTIONS),
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
  .strict()
  .superRefine((value, ctx) => {
    if (value.totals.answered > value.questionCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'answered must be <= questionCount',
        path: ['totals', 'answered'],
      });
    }
  });

export const PracticeSessionSummaryOutputSchema =
  EndPracticeSessionOutputSchema;
export const FinalizeExamAnswersOutputSchema =
  PracticeSessionSummaryOutputSchema;

export const SaveExamDraftAnswerOutputSchema = z
  .object({
    questionId: zUuid,
    markedForReview: z.boolean(),
    latestSelectedChoiceId: zUuid.nullable(),
    latestIsCorrect: z.boolean().nullable(),
    latestAnsweredAt: z.string().datetime().nullable(),
    draftSelectedChoiceId: zUuid.nullable(),
    draftSavedAt: z.string().datetime().nullable(),
    draftCumulativeMs: z.number().int().min(0),
  })
  .strict();

export type SaveExamDraftAnswerOutput = z.infer<
  typeof SaveExamDraftAnswerOutputSchema
>;

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
