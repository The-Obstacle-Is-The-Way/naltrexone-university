import { createChoice, createQuestion } from '@/src/domain/test-helpers';
import { runAnswerKeyChangeContract } from '@/tests/shared/answer-key-change-contract';
import { FakeQuestionRepository } from './fake-question-repository';

runAnswerKeyChangeContract('FakeQuestionRepository', async () => ({
  async seed(change) {
    const questionId = crypto.randomUUID();
    const currentRevisionId = crypto.randomUUID();
    const earlierRevisionId = crypto.randomUUID();
    const choices = (correct: 'B' | 'C') => [
      createChoice({ questionId, label: 'A', textMd: 'Choice A' }),
      createChoice({
        questionId,
        label: correct,
        textMd: correct === 'B' ? 'Choice B' : 'Revised C',
        isCorrect: true,
        sortOrder: 2,
      }),
    ];
    // Listed current first, as the fake reads revisions.
    const repository = new FakeQuestionRepository([
      createQuestion({
        id: questionId,
        revisionId: currentRevisionId,
        stemMd: '# Revised stem',
        choices: choices(change === 'correct choice' ? 'C' : 'B'),
      }),
      createQuestion({
        id: questionId,
        revisionId: earlierRevisionId,
        stemMd: '# Stem',
        choices: choices('B'),
      }),
    ]);
    return { repository, questionId, currentRevisionId, earlierRevisionId };
  },
}));
