import { useState } from 'react';
import { expect, test, vi } from 'vitest';
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

function createTallMarkdown(label: string, paragraphCount: number) {
  return Array.from(
    { length: paragraphCount },
    (_, index) =>
      `${label} paragraph ${index + 1}. ${'Detailed supporting content '.repeat(14)}`,
  ).join('\n\n');
}

function InteractiveReviewHarness() {
  const [currentQuestionId, setCurrentQuestionId] = useState('question-1');

  return (
    <PostExamReviewView
      summary={summary}
      review={review}
      currentQuestionId={currentQuestionId}
      controlledPanelId="practice-question-panel"
      bookmarkStatus="idle"
      isBookmarked={false}
      onToggleBookmark={() => undefined}
      onNavigateQuestion={setCurrentQuestionId}
      onViewSummary={() => undefined}
    />
  );
}

test('focuses the review panel on mount and scrolls it into view after navigation', async () => {
  const scrollIntoViewSpy = vi
    .spyOn(Element.prototype, 'scrollIntoView')
    .mockImplementation(() => undefined);

  try {
    const screen = await render(<InteractiveReviewHarness />);

    await expect
      .element(screen.getByRole('region', { name: 'Question 1 of 2' }))
      .toHaveFocus();
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();

    await screen.getByRole('button', { name: 'Next' }).click();

    await expect
      .element(screen.getByRole('region', { name: 'Question 2 of 2' }))
      .toHaveFocus();
    expect(scrollIntoViewSpy).toHaveBeenCalled();
  } finally {
    scrollIntoViewSpy.mockRestore();
  }
});

test('renders the post-exam review bottom action bar without sticky shell markers', async () => {
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
    .element(screen.getByTestId('sticky-action-bar-layout'))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByTestId('sticky-action-bar-scroll-region'))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByTestId('sticky-action-bar'))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByTestId('bottom-action-bar'))
    .toBeInTheDocument();
  await expect
    .element(screen.getByRole('button', { name: 'Next' }))
    .toBeVisible();
});
