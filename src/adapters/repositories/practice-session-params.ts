import { z } from 'zod';
import {
  MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS,
  MAX_PRACTICE_SESSION_QUESTIONS,
  MAX_PRACTICE_SESSION_TAG_FILTERS,
} from '@/src/adapters/shared/validation-limits';
import {
  ApplicationError,
  type ApplicationErrorCode,
} from '@/src/application/errors';
import type {
  PracticeSession,
  PracticeSessionQuestionState,
} from '@/src/domain/entities';

const questionDifficultySchema = z.enum(['easy', 'medium', 'hard']);

const practiceSessionQuestionStateSchema = z
  .object({
    questionId: z.string().min(1),
    markedForReview: z.boolean(),
    latestSelectedChoiceId: z.string().min(1).nullable(),
    latestIsCorrect: z.boolean().nullable(),
    latestAnsweredAt: z.string().datetime().nullable(),
  })
  .strict();

const practiceSessionParamsSchema = z
  .object({
    count: z.number().int().min(1).max(MAX_PRACTICE_SESSION_QUESTIONS),
    tagSlugs: z.array(z.string().min(1)).max(MAX_PRACTICE_SESSION_TAG_FILTERS),
    difficulties: z
      .array(questionDifficultySchema)
      .max(MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS),
    questionIds: z.array(z.string().min(1)).max(MAX_PRACTICE_SESSION_QUESTIONS),
    questionStates: z
      .array(practiceSessionQuestionStateSchema)
      .max(MAX_PRACTICE_SESSION_QUESTIONS)
      .optional(),
  })
  .strict();

type PracticeSessionParamsJson = z.infer<typeof practiceSessionParamsSchema>;
type PersistedQuestionState = z.infer<
  typeof practiceSessionQuestionStateSchema
>;

export type NormalizedPracticeSessionParamsJson = Omit<
  PracticeSessionParamsJson,
  'questionStates'
> & {
  questionStates: PersistedQuestionState[];
};

function toDomainQuestionState(
  state: PersistedQuestionState,
): PracticeSessionQuestionState {
  return {
    questionId: state.questionId,
    markedForReview: state.markedForReview,
    latestSelectedChoiceId: state.latestSelectedChoiceId,
    latestIsCorrect: state.latestIsCorrect,
    latestAnsweredAt: state.latestAnsweredAt
      ? new Date(state.latestAnsweredAt)
      : null,
  };
}

function serializeQuestionState(
  state: PracticeSessionQuestionState,
): PersistedQuestionState {
  return {
    questionId: state.questionId,
    markedForReview: state.markedForReview,
    latestSelectedChoiceId: state.latestSelectedChoiceId,
    latestIsCorrect: state.latestIsCorrect,
    latestAnsweredAt: state.latestAnsweredAt
      ? state.latestAnsweredAt.toISOString()
      : null,
  };
}

function normalizeParams(
  params: PracticeSessionParamsJson,
): NormalizedPracticeSessionParamsJson {
  const expectedQuestionIds = new Set(params.questionIds);
  const byQuestionId = new Map(
    (params.questionStates ?? [])
      .filter((state) => expectedQuestionIds.has(state.questionId))
      .map((state) => [state.questionId, state]),
  );

  return {
    ...params,
    questionStates: params.questionIds.map((questionId) => {
      const existing = byQuestionId.get(questionId);
      if (existing) return existing;

      return {
        questionId,
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: null,
      };
    }),
  };
}

export function parsePracticeSessionParamsJson(
  paramsJson: unknown,
  errorCode: ApplicationErrorCode,
): NormalizedPracticeSessionParamsJson {
  let parsed: PracticeSessionParamsJson;
  try {
    parsed = practiceSessionParamsSchema.parse(paramsJson);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const cleanedFieldErrors: Record<string, string[]> = {};
      for (const [field, messages] of Object.entries(
        error.flatten().fieldErrors,
      )) {
        if (messages) cleanedFieldErrors[field] = messages;
      }

      throw new ApplicationError(
        errorCode,
        `Invalid practice session parameters: ${error.message}`,
        cleanedFieldErrors,
      );
    }
    throw error;
  }

  return normalizeParams(parsed);
}

export function toPracticeSessionParamsJson(
  session: PracticeSession,
): NormalizedPracticeSessionParamsJson {
  return {
    count: session.questionIds.length,
    tagSlugs: [...session.tagFilters],
    difficulties: [...session.difficultyFilters],
    questionIds: [...session.questionIds],
    questionStates: session.questionStates.map((state) =>
      serializeQuestionState(state),
    ),
  };
}

export function toDomainPracticeSessionQuestionStates(
  params: NormalizedPracticeSessionParamsJson,
): PracticeSessionQuestionState[] {
  return params.questionStates.map((state) => toDomainQuestionState(state));
}
