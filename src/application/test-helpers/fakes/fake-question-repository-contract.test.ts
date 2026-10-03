import { createQuestion } from '@/src/domain/test-helpers';
import { runQuestionAvailabilityContract } from '@/tests/shared/question-availability-contract';
import { FakeQuestionRepository } from './fake-question-repository';

runQuestionAvailabilityContract('FakeQuestionRepository', async () => ({
  async seed(seed) {
    const questionId = crypto.randomUUID();
    const current = createQuestion({ id: questionId, status: seed.status });
    const earlier = createQuestion({
      id: questionId,
      revisionId: crypto.randomUUID(),
      status: seed.status,
    });
    const revisionIdOf = (revision: 'current' | 'earlier') =>
      revision === 'current' ? current.revisionId : earlier.revisionId;
    const repository = new FakeQuestionRepository([current, earlier], {
      withdrawals: seed.withdrawn
        ? [{ questionId, questionRevisionId: current.revisionId }]
        : [],
      holds: (seed.holds ?? []).map((hold) => ({
        questionId,
        questionRevisionId: revisionIdOf(hold.revision),
        lifted: hold.lifted,
      })),
    });
    return {
      repository,
      questionId,
      currentRevisionId: current.revisionId,
      earlierRevisionId: earlier.revisionId,
    };
  },
}));
