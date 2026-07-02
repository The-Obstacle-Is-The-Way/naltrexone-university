import { z } from 'zod';
import {
  MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS,
  MAX_PRACTICE_SESSION_QUESTIONS,
  MAX_PRACTICE_SESSION_TAG_FILTERS,
  MAX_TAG_SLUG_LENGTH,
} from '@/src/adapters/shared/validation-limits';
import {
  ApplicationError,
  type ApplicationErrorCode,
} from '@/src/application/errors';
import type { PracticeSession } from '@/src/domain/entities';
import { zUuid } from '../shared/zod-schemas';

const questionDifficultySchema = z.enum(['easy', 'medium', 'hard']);

const practiceSessionParamsSchema = z
  .object({
    count: z.number().int().min(1).max(MAX_PRACTICE_SESSION_QUESTIONS),
    tagSlugs: z
      .array(z.string().min(1).max(MAX_TAG_SLUG_LENGTH))
      .max(MAX_PRACTICE_SESSION_TAG_FILTERS),
    difficulties: z
      .array(questionDifficultySchema)
      .max(MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS),
    questionIds: z
      .array(zUuid)
      .min(1)
      .max(MAX_PRACTICE_SESSION_QUESTIONS)
      .refine(
        (questionIds) => new Set(questionIds).size === questionIds.length,
        {
          message: 'questionIds must be unique',
        },
      ),
  })
  .refine((params) => params.count === params.questionIds.length, {
    message: 'count must match questionIds length',
    path: ['count'],
  });

export type PracticeSessionParamsJson = z.infer<
  typeof practiceSessionParamsSchema
>;

export function parsePracticeSessionParamsJson(
  paramsJson: unknown,
  errorCode: ApplicationErrorCode,
): PracticeSessionParamsJson {
  let parsed: PracticeSessionParamsJson;
  try {
    parsed = practiceSessionParamsSchema.parse(paramsJson);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const cleanedFieldErrors: Record<string, string[]> = {};
      for (const [field, messages] of Object.entries(
        z.flattenError(error).fieldErrors,
      )) {
        if (Array.isArray(messages)) cleanedFieldErrors[field] = messages;
      }

      throw new ApplicationError(
        errorCode,
        `Invalid practice session parameters: ${error.message}`,
        cleanedFieldErrors,
      );
    }
    throw error;
  }

  return parsed;
}

export function toPracticeSessionParamsJson(
  session: PracticeSession,
): PracticeSessionParamsJson {
  return {
    count: session.questionIds.length,
    tagSlugs: [...session.tagFilters],
    difficulties: [...session.difficultyFilters],
    questionIds: [...session.questionIds],
  };
}
