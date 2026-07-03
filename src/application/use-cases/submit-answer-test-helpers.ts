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
  override async recordQuestionAnswer(): Promise<never> {
    throw new ApplicationError(
      'CONFLICT',
      'Practice session state changed concurrently; please retry.',
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
  createAttempt,
  createChoice,
  createPracticeSession,
  createQuestion,
  createQuestionSeed,
  FailingRecordSessionRepository,
  FakeAttemptRepository,
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
  passthroughTransaction,
  SubmitAnswerUseCase,
  shuffleWithSeed,
  ThrowingInfoLogger,
};
