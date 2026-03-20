import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import type {
  EndPracticeSessionOutput,
  GetCompletedSessionQuestionsWithFeedbackOutput,
} from '@/src/adapters/controllers/practice-controller';
import { PostExamReviewView } from './post-exam-review-view';

function createSummary(
  overrides?: Partial<EndPracticeSessionOutput>,
): EndPracticeSessionOutput {
  return {
    sessionId: 'session-1',
    mode: 'exam',
    questionCount: 2,
    endedAt: '2026-03-20T00:00:00.000Z',
    totals: {
      answered: 2,
      correct: 1,
      accuracy: 0.5,
      durationSeconds: 120,
    },
    ...overrides,
  };
}

function createReviewRow(
  overrides?: Partial<
    GetCompletedSessionQuestionsWithFeedbackOutput['rows'][number]
  >,
): GetCompletedSessionQuestionsWithFeedbackOutput['rows'][number] {
  return {
    isAvailable: true,
    questionId: 'question-1',
    slug: 'question-1',
    stemMd: 'Question stem',
    difficulty: 'easy',
    order: 1,
    isAnswered: true,
    isCorrect: false,
    markedForReview: false,
    choices: [
      { id: 'choice-a', label: 'A', textMd: 'Choice A' },
      { id: 'choice-b', label: 'B', textMd: 'Choice B' },
    ],
    selectedChoiceId: 'choice-a',
    correctChoiceId: 'choice-b',
    explanationMd: 'Explanation for review.',
    referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
    choiceExplanations: [
      {
        choiceId: 'choice-a',
        displayLabel: 'A',
        textMd: 'Choice A',
        isCorrect: false,
        explanationMd: 'Choice A is incorrect.',
      },
      {
        choiceId: 'choice-b',
        displayLabel: 'B',
        textMd: 'Choice B',
        isCorrect: true,
        explanationMd: 'Choice B is correct.',
      },
    ],
    ...overrides,
  };
}

function createReview(): GetCompletedSessionQuestionsWithFeedbackOutput {
  const firstRow = createReviewRow();
  const secondRow = createReviewRow({
    questionId: 'question-2',
    slug: 'question-2',
    stemMd: 'Second question stem',
    order: 2,
    isCorrect: true,
    selectedChoiceId: 'choice-b',
    explanationMd: 'Second explanation for review.',
  });

  return {
    sessionId: 'session-1',
    mode: 'exam',
    totalCount: 2,
    answeredCount: 2,
    markedCount: 0,
    rows: [firstRow, secondRow],
  };
}

function renderView(currentQuestionId: string) {
  return (
    <PostExamReviewView
      summary={createSummary()}
      review={createReview()}
      currentQuestionId={currentQuestionId}
      controlledPanelId="practice-question-panel"
      bookmarkStatus="idle"
      isBookmarked={false}
      onToggleBookmark={() => undefined}
      onNavigateQuestion={() => undefined}
      onViewSummary={() => undefined}
    />
  );
}

test('focuses the review panel on mount and after question navigation rerenders', async () => {
  const screen = await render(renderView('question-1'));

  await expect
    .element(screen.getByRole('region', { name: 'Question 1 of 2' }))
    .toHaveFocus();

  await screen.rerender(renderView('question-2'));

  await expect
    .element(screen.getByRole('region', { name: 'Question 2 of 2' }))
    .toHaveFocus();
});
