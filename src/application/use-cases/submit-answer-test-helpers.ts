import { createQuestionSeed, shuffleWithSeed } from '@/src/domain/services';
import {
  createAttempt,
  createChoice,
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import { AllChoiceLabels } from '@/src/domain/value-objects';
import { ApplicationError } from '../errors';
import {
  FakeAttemptRepository,
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '../test-helpers/fakes';
import type { SubmitAnswerWriteTransaction } from './submit-answer';
import { SubmitAnswerUseCase } from './submit-answer';

function passthroughTransaction(
  attempts: FakeAttemptRepository,
  sessions: FakePracticeSessionRepository,
): SubmitAnswerWriteTransaction {
  return async (fn) => fn({ attempts, sessions });
}

class FailingRecordSessionRepository extends FakePracticeSessionRepository {
  async recordQuestionAnswer(): Promise<never> {
    throw new ApplicationError(
      'INTERNAL_ERROR',
      'Failed to persist practice session answer state',
    );
  }
}

class ThrowingInfoLogger extends FakeLogger {
  infoCallCount = 0;

  override info(_context: Record<string, unknown>, _msg: string): void {
    this.infoCallCount += 1;
    throw new Error('logger info failed');
  }
}

export {
  AllChoiceLabels,
  ApplicationError,
  FailingRecordSessionRepository,
  FakeAttemptRepository,
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
  SubmitAnswerUseCase,
  ThrowingInfoLogger,
  createAttempt,
  createChoice,
  createPracticeSession,
  createQuestion,
  createQuestionSeed,
  passthroughTransaction,
  shuffleWithSeed,
};
