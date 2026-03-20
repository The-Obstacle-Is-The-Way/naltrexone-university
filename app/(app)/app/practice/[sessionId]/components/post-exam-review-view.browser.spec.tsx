import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { PostExamReviewView } from './post-exam-review-view';
import {
  createReview,
  createReviewRow,
  createSummary,
} from './post-exam-review-view.fixtures';

const summary = createSummary({
  questionCount: 2,
  totals: { answered: 2, correct: 1, accuracy: 0.5, durationSeconds: 120 },
});

const review = createReview([
  createReviewRow({
    isAnswered: true,
    isCorrect: false,
    selectedChoiceId: 'choice-a',
  }),
  createReviewRow({
    questionId: 'question-2',
    slug: 'question-2',
    stemMd: 'Second question stem',
    order: 2,
    isAnswered: true,
    isCorrect: true,
    selectedChoiceId: 'choice-b',
    explanationMd: 'Second explanation for review.',
  }),
]);

function renderView(currentQuestionId: string) {
  return (
    <PostExamReviewView
      summary={summary}
      review={review}
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
