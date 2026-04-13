import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { installStickyActionBarBrowserStyles } from '../../components/sticky-action-bar.browser-test-styles';
import { PostExamReviewView } from './post-exam-review-view';
import {
  createReview,
  createReviewRow,
  createSummary,
} from './post-exam-review-view.fixtures';

installStickyActionBarBrowserStyles();

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

function createTallMarkdown(label: string, paragraphCount: number) {
  return Array.from(
    { length: paragraphCount },
    (_, index) =>
      `${label} paragraph ${index + 1}. ${'Detailed supporting content '.repeat(14)}`,
  ).join('\n\n');
}

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

test('keeps the post-exam review action bar in the viewport on tall feedback', async () => {
  const tallReview = createReview([
    createReviewRow({
      stemMd: createTallMarkdown('Review stem', 18),
      isAnswered: true,
      isCorrect: false,
      selectedChoiceId: 'choice-a',
      explanationMd: createTallMarkdown('Review explanation', 28),
      referenceMd: createTallMarkdown('Review reference', 10),
      choiceExplanations: [
        {
          choiceId: 'choice-a',
          displayLabel: 'A',
          textMd: 'Choice A',
          isCorrect: false,
          explanationMd: createTallMarkdown('Choice A explanation', 8),
        },
        {
          choiceId: 'choice-b',
          displayLabel: 'B',
          textMd: 'Choice B',
          isCorrect: true,
          explanationMd: createTallMarkdown('Choice B explanation', 8),
        },
      ],
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

  const screen = await render(
    <PostExamReviewView
      summary={summary}
      review={tallReview}
      currentQuestionId="question-1"
      controlledPanelId="practice-question-panel"
      bookmarkStatus="idle"
      isBookmarked={false}
      onToggleBookmark={() => undefined}
      onNavigateQuestion={() => undefined}
      onViewSummary={() => undefined}
    />,
  );

  await expect
    .element(screen.getByTestId('sticky-action-bar'))
    .toBeInTheDocument();
  await expect
    .element(screen.getByTestId('bottom-action-bar'))
    .toBeInTheDocument();
  await expect
    .element(screen.getByRole('button', { name: 'Next' }))
    .toBeVisible();

  const actionBar = document.querySelector<HTMLElement>(
    '[data-testid="bottom-action-bar"]',
  );
  expect(actionBar).not.toBeNull();
  expect(actionBar?.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    window.innerHeight,
  );
});
