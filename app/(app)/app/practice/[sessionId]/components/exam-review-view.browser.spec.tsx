import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ExamReviewView, QuestionNavigator } from './exam-review-view';

const fixtureSession1Id = crypto.randomUUID();
const fixtureQ1Id = crypto.randomUUID();
const fixtureQ2Id = crypto.randomUUID();
const fixtureQ3Id = crypto.randomUUID();

const reviewInstructionText =
  'Select a question below to keep reviewing before you submit.';

test('renders navigator states and disables unavailable questions', async () => {
  const onNavigateQuestion = vi.fn();

  const screen = await render(
    <QuestionNavigator
      review={{
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 3,
        answeredCount: 2,
        markedCount: 1,
        rows: [
          {
            questionId: fixtureQ1Id,
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
          },
          {
            questionId: fixtureQ2Id,
            slug: 'q-2',
            order: 2,
            isAvailable: true,
            stemMd: 'Stem 2',
            difficulty: 'medium',
            isAnswered: true,
            isCorrect: false,
            isOmitted: false,
            markedForReview: true,
          },
          {
            questionId: fixtureQ3Id,
            order: 3,
            isAvailable: false,
            isAnswered: false,
            isCorrect: null,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      }}
      currentQuestionId={fixtureQ1Id}
      controlledPanelId="practice-question-panel"
      onNavigateQuestion={onNavigateQuestion}
    />,
  );

  await screen
    .getByRole('button', { name: 'Question 2: Marked for review, Answered' })
    .click();
  expect(onNavigateQuestion).toHaveBeenCalledWith(fixtureQ2Id);
  await expect
    .element(screen.getByRole('button', { name: 'Question 3: Unanswered' }))
    .toBeDisabled();
});

test('uses correctness labels only in tutor mode', async () => {
  const onNavigateQuestion = vi.fn();

  const screen = await render(
    <QuestionNavigator
      review={{
        sessionId: fixtureSession1Id,
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          {
            questionId: fixtureQ1Id,
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
          },
          {
            questionId: fixtureQ2Id,
            slug: 'q-2',
            order: 2,
            isAvailable: true,
            stemMd: 'Stem 2',
            difficulty: 'medium',
            isAnswered: true,
            isCorrect: false,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      }}
      currentQuestionId={fixtureQ1Id}
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
  expect(onNavigateQuestion).toHaveBeenCalledWith(fixtureQ2Id);
});

test('opens a review question and finalizes the exam', async () => {
  const onOpenQuestion = vi.fn();
  const onFinalizeReview = vi.fn(async () => undefined);

  const screen = await render(
    <ExamReviewView
      review={{
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
        markedCount: 1,
        rows: [
          {
            questionId: fixtureQ1Id,
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'A long stem for q1',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: false,
            isOmitted: false,
            markedForReview: true,
          },
          {
            questionId: fixtureQ2Id,
            order: 2,
            isAvailable: false,
            isAnswered: false,
            isCorrect: null,
            isOmitted: false,
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
    .getByRole('button', {
      name: /Open question 1\..*A long stem for q1.*Answered.*Marked for review.*Incorrect/i,
    })
    .click();
  expect(onOpenQuestion).toHaveBeenCalledWith(fixtureQ1Id);
  await expect
    .element(screen.getByText(reviewInstructionText, { exact: true }))
    .toBeVisible();

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
        sessionId: fixtureSession1Id,
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
        sessionId: fixtureSession1Id,
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
        sessionId: fixtureSession1Id,
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

test('keeps the helper text visible and the first review row above the fold at 375x667', async () => {
  await page.viewport(375, 667);

  try {
    const screen = await render(
      <ExamReviewView
        review={{
          sessionId: fixtureSession1Id,
          mode: 'exam',
          totalCount: 10,
          answeredCount: 6,
          markedCount: 2,
          rows: Array.from({ length: 10 }, (_, index) => ({
            questionId: crypto.randomUUID(),
            slug: `q-${index + 1}`,
            order: index + 1,
            isAvailable: index < 9,
            stemMd: `Mobile review row ${index + 1}`,
            difficulty: 'medium' as const,
            isAnswered: index < 6,
            isCorrect: index < 6 ? index % 2 === 0 : null,
            isOmitted: false,
            markedForReview: index === 1 || index === 4,
          })),
        }}
        isPending={false}
        onOpenQuestion={() => undefined}
        onFinalizeReview={async () => undefined}
      />,
    );

    await expect
      .element(screen.getByText(reviewInstructionText, { exact: true }))
      .toBeVisible();

    const helper = Array.from(document.querySelectorAll('p')).find(
      (paragraph) => paragraph.textContent?.trim() === reviewInstructionText,
    );
    const firstRow = document.querySelector<HTMLButtonElement>(
      'ul.space-y-3 > li > button',
    );

    expect(helper).not.toBeNull();
    expect(firstRow).not.toBeNull();

    const helperRect = helper?.getBoundingClientRect();
    const firstRowRect = firstRow?.getBoundingClientRect();

    expect(helperRect).toBeDefined();
    expect(firstRowRect).toBeDefined();
    expect(helperRect?.top ?? Number.POSITIVE_INFINITY).toBeGreaterThanOrEqual(
      0,
    );
    expect(firstRowRect?.top ?? Number.POSITIVE_INFINITY).toBeGreaterThan(
      helperRect?.bottom ?? Number.NEGATIVE_INFINITY,
    );
    expect(
      firstRowRect?.bottom ?? Number.POSITIVE_INFINITY,
    ).toBeLessThanOrEqual(window.innerHeight);
  } finally {
    await page.viewport(1280, 800);
  }
});

test('keeps empty-stem rows discoverable by accessible name', async () => {
  const onOpenQuestion = vi.fn();
  const onFinalizeReview = vi.fn(async () => undefined);

  const screen = await render(
    <ExamReviewView
      review={{
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: fixtureQ1Id,
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: '',
            difficulty: 'easy',
            isAnswered: false,
            isCorrect: null,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      }}
      isPending={false}
      onOpenQuestion={onOpenQuestion}
      onFinalizeReview={onFinalizeReview}
    />,
  );

  await screen
    .getByRole('button', { name: /Open question 1\..*Unanswered/i })
    .click();
  expect(onOpenQuestion).toHaveBeenCalledWith(fixtureQ1Id);
});

test('supports keyboard activation for available review rows and leaves unavailable rows non-interactive', async () => {
  const onOpenQuestion = vi.fn();

  const screen = await render(
    <ExamReviewView
      review={{
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            questionId: fixtureQ1Id,
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Keyboard target stem',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
          },
          {
            questionId: fixtureQ2Id,
            order: 2,
            isAvailable: false,
            isAnswered: false,
            isCorrect: null,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      }}
      isPending={false}
      onOpenQuestion={onOpenQuestion}
      onFinalizeReview={async () => undefined}
    />,
  );

  const availableRowButton = screen.getByRole('button', {
    name: /Open question 1\..*Keyboard target stem.*Answered.*Correct/i,
  });

  await userEvent.tab();
  await expect.element(availableRowButton).toHaveFocus();

  await userEvent.keyboard('{Enter}');
  await userEvent.keyboard(' ');

  expect(onOpenQuestion).toHaveBeenCalledTimes(2);
  expect(onOpenQuestion).toHaveBeenNthCalledWith(1, fixtureQ1Id);
  expect(onOpenQuestion).toHaveBeenNthCalledWith(2, fixtureQ1Id);
  await expect
    .element(screen.getByText('[Question no longer available]'))
    .toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: /Open question 2\b/i }))
    .not.toBeInTheDocument();
});

test('renders decorative chevrons only on available review rows', async () => {
  const screen = await render(
    <ExamReviewView
      review={{
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 3,
        answeredCount: 1,
        markedCount: 1,
        rows: [
          {
            questionId: fixtureQ1Id,
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Chevron target stem',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: true,
          },
          {
            questionId: fixtureQ2Id,
            slug: 'q-2',
            order: 2,
            isAvailable: true,
            stemMd: 'Second chevron target stem',
            difficulty: 'medium',
            isAnswered: false,
            isCorrect: null,
            isOmitted: false,
            markedForReview: false,
          },
          {
            questionId: fixtureQ3Id,
            order: 3,
            isAvailable: false,
            isAnswered: false,
            isCorrect: null,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      }}
      isPending={false}
      onOpenQuestion={() => undefined}
      onFinalizeReview={async () => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: /Open question 1\./i }))
    .toBeVisible();

  const chevrons = document.querySelectorAll(
    '[data-testid="exam-review-row-chevron"]',
  );

  expect(chevrons).toHaveLength(2);
  chevrons.forEach((chevron) => {
    expect(chevron.getAttribute('aria-hidden')).toBe('true');
  });
  expect(
    screen.getByRole('button', {
      name: /Open question 1\..*Chevron target stem.*Answered.*Marked for review.*Correct/i,
    }),
  ).toBeDefined();
  await expect
    .element(screen.getByText('[Question no longer available]'))
    .toBeVisible();
});

test('keeps the row-to-submit tab order unchanged with the helper text skipped', async () => {
  const screen = await render(
    <ExamReviewView
      review={{
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 3,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          {
            questionId: fixtureQ1Id,
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'First tab target',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
          },
          {
            questionId: fixtureQ2Id,
            slug: 'q-2',
            order: 2,
            isAvailable: true,
            stemMd: 'Second tab target',
            difficulty: 'medium',
            isAnswered: true,
            isCorrect: false,
            isOmitted: false,
            markedForReview: false,
          },
          {
            questionId: fixtureQ3Id,
            order: 3,
            isAvailable: false,
            isAnswered: false,
            isCorrect: null,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      }}
      isPending={false}
      onOpenQuestion={() => undefined}
      onFinalizeReview={async () => undefined}
    />,
  );

  const firstRowButton = screen.getByRole('button', {
    name: /Open question 1\..*First tab target.*Answered.*Correct/i,
  });
  const secondRowButton = screen.getByRole('button', {
    name: /Open question 2\..*Second tab target.*Answered.*Incorrect/i,
  });
  const submitButton = screen.getByRole('button', { name: 'Submit exam' });

  await expect
    .element(screen.getByText(reviewInstructionText, { exact: true }))
    .toBeVisible();

  await userEvent.tab();
  await expect.element(firstRowButton).toHaveFocus();
  await userEvent.tab();
  await expect.element(secondRowButton).toHaveFocus();
  await userEvent.tab();
  await expect.element(submitButton).toHaveFocus();
});
