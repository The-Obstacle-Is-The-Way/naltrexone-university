import { createQuestionSeed, shuffleWithSeed } from '@/src/domain/services';
import {
  createAttempt,
  createChoice,
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import { AllChoiceLabels } from '@/src/domain/value-objects';
import { ApplicationError } from '../errors';
import type { SubmitAnswerWriteTransaction } from '../use-cases/submit-answer';
import { SubmitAnswerUseCase } from '../use-cases/submit-answer';
import {
  FakeAttemptRepository,
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
  STATE_CHANGED_CONCURRENTLY_MESSAGE,
} from './fakes';

function passthroughTransaction(
  attempts: FakeAttemptRepository,
  sessions: FakePracticeSessionRepository,
): SubmitAnswerWriteTransaction {
  return async (fn) => fn({ attempts, sessions });
}

class FailingRecordSessionRepository extends FakePracticeSessionRepository {
  override async recordQuestionAnswer(): Promise<never> {
    throw new ApplicationError('CONFLICT', STATE_CHANGED_CONCURRENTLY_MESSAGE);
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
  STATE_CHANGED_CONCURRENTLY_MESSAGE,
  SubmitAnswerUseCase,
  shuffleWithSeed,
  ThrowingInfoLogger,
};
