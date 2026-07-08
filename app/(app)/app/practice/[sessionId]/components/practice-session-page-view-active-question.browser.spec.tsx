import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { PracticeSessionPageView } from './practice-session-page-view';
import { noop } from './practice-session-page-view-test-helpers';

const fixtureSession1Id = crypto.randomUUID();
const fixtureQ1Id = crypto.randomUUID();
const fixtureQ2Id = crypto.randomUUID();

test('renders active question branch with navigator and navigation callback', async () => {
  const onNavigateQuestion = vi.fn();
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
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
            isAnswered: false,
            isCorrect: null,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      }}
      sessionInfo={{
        sessionId: fixtureSession1Id,
        mode: 'exam',

        deadlineAt: '2099-05-22T12:02:24.000Z',

        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: fixtureQ1Id,
        slug: 'q-1',
        stemMd: 'Stem 1',
        difficulty: 'easy',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onToggleMarkForReview={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
      onNavigateQuestion={onNavigateQuestion}
    />,
  );

  await expect.element(screen.getByText('Exam Session')).toBeVisible();
  await expect
    .element(
      screen.getByText(
        'Question 1 of 2 — Explanations shown after you submit the exam.',
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText('Question navigator')).toBeVisible();
  await screen.getByRole('button', { name: 'Question 2: Unanswered' }).click();
  expect(onNavigateQuestion).toHaveBeenCalledWith(fixtureQ2Id);
});

test('does not render Review & Submit in the active exam-question header', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={null}
      sessionInfo={{
        sessionId: fixtureSession1Id,
        mode: 'exam',

        deadlineAt: '2099-05-22T12:02:24.000Z',

        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: fixtureQ1Id,
        slug: 'q-1',
        stemMd: 'Stem 1',
        difficulty: 'easy',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onToggleMarkForReview={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: 'Review & Submit' }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole('button', { name: 'End session' }))
    .not.toBeInTheDocument();
});

test('keeps End session in the active tutor-question header', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={null}
      sessionInfo={{
        sessionId: fixtureSession1Id,
        mode: 'tutor',

        deadlineAt: null,

        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: fixtureQ1Id,
        slug: 'q-1',
        stemMd: 'Stem 1',
        difficulty: 'easy',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onToggleMarkForReview={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: 'End session' }))
    .toBeVisible();
});

test('wires navigator aria-controls to an existing question panel id', async () => {
  await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
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
            isAnswered: false,
            isCorrect: null,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      }}
      sessionInfo={{
        sessionId: fixtureSession1Id,
        mode: 'exam',

        deadlineAt: '2099-05-22T12:02:24.000Z',

        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: fixtureQ1Id,
        slug: 'q-1',
        stemMd: 'Stem 1',
        difficulty: 'easy',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onToggleMarkForReview={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
      onNavigateQuestion={noop}
    />,
  );

  const navigatorButton = document.querySelector<HTMLButtonElement>(
    '[aria-label="Question 2: Unanswered"]',
  );

  expect(navigatorButton).not.toBeNull();
  const controlledPanelId =
    navigatorButton?.getAttribute('aria-controls') ?? null;

  if (!controlledPanelId) {
    throw new Error('Expected navigator button to expose aria-controls');
  }

  expect(document.getElementById(controlledPanelId)).not.toBeNull();
});

test('renders navigator error with retry action', async () => {
  const onRetryNavigator = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={null}
      navigatorLoadState={{
        status: 'error',
        message: 'Navigator unavailable.',
      }}
      sessionInfo={{
        sessionId: fixtureSession1Id,
        mode: 'exam',

        deadlineAt: '2099-05-22T12:02:24.000Z',

        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={null}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      onEndSession={noop}
      onRetryNavigator={onRetryNavigator}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
    />,
  );

  await expect
    .element(screen.getByText('Navigator unavailable.'))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Retry navigator' }).click();
  expect(onRetryNavigator).toHaveBeenCalledTimes(1);
});

test('passes the tutor Submit affordance through to the question surface', async () => {
  const onSubmit = vi.fn();
  const fixtureChoiceId = crypto.randomUUID();
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={null}
      sessionInfo={{
        sessionId: fixtureSession1Id,
        mode: 'tutor',

        deadlineAt: null,

        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: fixtureQ1Id,
        slug: 'q-1',
        stemMd: 'Stem 1',
        difficulty: 'easy',
        choices: [
          { id: fixtureChoiceId, label: 'A', textMd: 'Choice A', sortOrder: 1 },
        ],
        session: null,
      }}
      selectedChoiceId={fixtureChoiceId}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      canSubmit={true}
      bookmarkStatus="idle"
      isBookmarked={false}
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onToggleMarkForReview={noop}
      onSelectChoice={noop}
      onSubmit={onSubmit}
      onNextQuestion={noop}
      onNavigateQuestion={noop}
    />,
  );

  // The orchestrator seam: canSubmit/onSubmit must reach PracticeView so the
  // keyboard-pending Submit affordance renders and fires in real sessions.
  const submitButton = screen.getByRole('button', { name: 'Submit' });
  await expect.element(submitButton).toBeVisible();
  await submitButton.click();
  expect(onSubmit).toHaveBeenCalledTimes(1);
});
