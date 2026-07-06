import { ApplicationError } from '@/src/application/errors';
import type {
  PracticeSession,
  PracticeSessionQuestionState,
} from '@/src/domain/entities';

export function createPracticeSessionStateMap(
  session: Pick<PracticeSession, 'questionStates'>,
): Map<string, PracticeSessionQuestionState> {
  return new Map(
    session.questionStates.map((state) => [state.questionId, state]),
  );
}

export function requirePracticeSessionQuestionState(input: {
  sessionId: string;
  questionId: string;
  stateByQuestionId: ReadonlyMap<string, PracticeSessionQuestionState>;
}): PracticeSessionQuestionState {
  const state = input.stateByQuestionId.get(input.questionId);
  if (!state) {
    throw new ApplicationError(
      'INTERNAL_ERROR',
      `Practice session ${input.sessionId} is missing normalized question state for question ${input.questionId}`,
    );
  }
  return state;
}
