import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ExamReviewView, QuestionNavigator } from './exam-review-view';

test('renders navigator states and disables unavailable questions', async () => {
  const onNavigateQuestion = vi.fn();

  const screen = await render(
    <QuestionNavigator
      review={{
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 3,
        answeredCount: 2,
        markedCount: 1,
        rows: [
          {
            questionId: 'q1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            order: 2,
            isAvailable: true,
            stemMd: 'Stem 2',
            difficulty: 'medium',
            isAnswered: true,
            isCorrect: false,
            markedForReview: true,
          },
          {
            questionId: 'q3',
            order: 3,
            isAvailable: false,
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      }}
      currentQuestionId="q1"
      onNavigateQuestion={onNavigateQuestion}
    />,
  );

  await screen.getByRole('button', { name: 'Question 2: Incorrect' }).click();
  expect(onNavigateQuestion).toHaveBeenCalledWith('q2');
  await expect
    .element(screen.getByRole('button', { name: 'Question 3: Unanswered' }))
    .toBeDisabled();
});

test('opens a review question and finalizes the exam', async () => {
  const onOpenQuestion = vi.fn();
  const onFinalizeReview = vi.fn();

  const screen = await render(
    <ExamReviewView
      review={{
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
        markedCount: 1,
        rows: [
          {
            questionId: 'q1',
            order: 1,
            isAvailable: true,
            stemMd: 'A long stem for q1',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: false,
            markedForReview: true,
          },
          {
            questionId: 'q2',
            order: 2,
            isAvailable: false,
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      }}
      isPending={false}
      onOpenQuestion={onOpenQuestion}
      onFinalizeReview={onFinalizeReview}
    />,
  );

  await expect.element(screen.getByText('Review Questions')).toBeVisible();
  await expect
    .element(screen.getByText('Marked', { exact: true }))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Open question' }).click();
  expect(onOpenQuestion).toHaveBeenCalledWith('q1');

  await screen.getByRole('button', { name: 'Submit exam' }).click();
  expect(onFinalizeReview).toHaveBeenCalledTimes(1);
});
