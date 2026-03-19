import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
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
            slug: 'q-1',
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
            slug: 'q-2',
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
      controlledPanelId="practice-question-panel"
      onNavigateQuestion={onNavigateQuestion}
    />,
  );

  await screen
    .getByRole('button', { name: 'Question 2: Marked for review, Answered' })
    .click();
  expect(onNavigateQuestion).toHaveBeenCalledWith('q2');
  await expect
    .element(screen.getByRole('button', { name: 'Question 3: Unanswered' }))
    .toBeDisabled();
});

test('uses correctness labels only in tutor mode', async () => {
  const onNavigateQuestion = vi.fn();

  const screen = await render(
    <QuestionNavigator
      review={{
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
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
            slug: 'q-2',
            order: 2,
            isAvailable: true,
            stemMd: 'Stem 2',
            difficulty: 'medium',
            isAnswered: true,
            isCorrect: false,
            markedForReview: false,
          },
        ],
      }}
      currentQuestionId="q1"
      controlledPanelId="practice-question-panel"
      onNavigateQuestion={onNavigateQuestion}
    />,
  );

  await expect
    .element(
      screen.getByRole('button', { name: 'Question 1: Current, Correct' }),
    )
    .toBeVisible();
  await screen.getByRole('button', { name: 'Question 2: Incorrect' }).click();
  expect(onNavigateQuestion).toHaveBeenCalledWith('q2');
});

test('opens a review question and finalizes the exam', async () => {
  const onOpenQuestion = vi.fn();
  const onFinalizeReview = vi.fn(async () => undefined);

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
            slug: 'q-1',
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

  await expect
    .element(screen.getByRole('heading', { name: 'Review & Submit' }))
    .toBeVisible();
  await expect
    .element(screen.getByText('Marked', { exact: true }))
    .toBeVisible();
  await screen
    .getByRole('button', { name: 'Open question 1: A long stem for q1' })
    .click();
  expect(onOpenQuestion).toHaveBeenCalledWith('q1');

  await screen.getByRole('button', { name: 'Submit exam' }).click();
  await expect
    .element(screen.getByRole('alertdialog', { name: 'Submit exam?' }))
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        'You have 1 unanswered question that will be scored as incorrect.',
      ),
    )
    .toBeVisible();
  await screen.getByRole('button', { name: 'Confirm submit' }).click();
  expect(onFinalizeReview).toHaveBeenCalledTimes(1);
});

test('guards against double-clicking confirm submit before pending state updates', async () => {
  const onFinalizeReview = vi.fn(() => new Promise<void>(() => {}));

  const screen = await render(
    <ExamReviewView
      review={{
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 1,
        answeredCount: 0,
        markedCount: 0,
        rows: [],
      }}
      isPending={false}
      onOpenQuestion={() => undefined}
      onFinalizeReview={onFinalizeReview}
    />,
  );

  await screen.getByRole('button', { name: 'Submit exam' }).click();
  await expect
    .element(screen.getByRole('alertdialog', { name: 'Submit exam?' }))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Confirm submit' }).dblClick();
  expect(onFinalizeReview).toHaveBeenCalledTimes(1);
});

test('allows submitting again after finalize resolves even when pending state never flips', async () => {
  const finalizeDeferred = createDeferred<void>();
  const onFinalizeReview = vi.fn(() => finalizeDeferred.promise);

  const screen = await render(
    <ExamReviewView
      review={{
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 1,
        answeredCount: 0,
        markedCount: 0,
        rows: [],
      }}
      isPending={false}
      onOpenQuestion={() => undefined}
      onFinalizeReview={onFinalizeReview}
    />,
  );

  await screen.getByRole('button', { name: 'Submit exam' }).click();
  await expect
    .element(screen.getByRole('alertdialog', { name: 'Submit exam?' }))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Confirm submit' }).click();
  expect(onFinalizeReview).toHaveBeenCalledTimes(1);

  finalizeDeferred.resolve();
  await finalizeDeferred.promise;

  await expect
    .element(screen.getByRole('alertdialog', { name: 'Submit exam?' }))
    .not.toBeInTheDocument();

  await screen.getByRole('button', { name: 'Submit exam' }).click();
  await expect
    .element(screen.getByRole('alertdialog', { name: 'Submit exam?' }))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Confirm submit' }).click();
  expect(onFinalizeReview).toHaveBeenCalledTimes(2);
});

test('omits unanswered warning when all exam questions are answered', async () => {
  const screen = await render(
    <ExamReviewView
      review={{
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [],
      }}
      isPending={false}
      onOpenQuestion={() => undefined}
      onFinalizeReview={async () => undefined}
    />,
  );

  await screen.getByRole('button', { name: 'Submit exam' }).click();
  await expect
    .element(screen.getByText('unanswered question', { exact: false }))
    .not.toBeInTheDocument();
});

test('omits the stem preview in the open question aria-label when stem is empty', async () => {
  const onOpenQuestion = vi.fn();
  const onFinalizeReview = vi.fn(async () => undefined);

  const screen = await render(
    <ExamReviewView
      review={{
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 1,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: '',
            difficulty: 'easy',
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

  await screen.getByRole('button', { name: 'Open question 1' }).click();
  expect(onOpenQuestion).toHaveBeenCalledWith('q1');
});
