import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import {
  createReviewResponse,
  createReviewRow,
} from '../hooks/practice-session-page-controller.browser.fixtures';
import { PracticeSessionPageView } from './practice-session-page-view';

test('renders session summary branch when summary is present', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={{
        sessionId: 'session-1',
        endedAt: '2026-02-07T00:00:00.000Z',
        mode: 'tutor',
        questionCount: 10,
        totals: {
          answered: 10,
          correct: 8,
          accuracy: 0.8,
          durationSeconds: 1200,
        },
      }}
      sessionInfo={null}
      loadState={{ status: 'ready' }}
      question={null}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await expect.element(screen.getByText('Session Summary')).toBeVisible();
  await expect.element(screen.getByText('80%')).toBeVisible();
});

test('renders exam review branch and triggers review actions', async () => {
  const onOpenReviewQuestion = vi.fn();
  const onFinalizeReview = vi.fn(async () => undefined);

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={{
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'A sample exam review question stem',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
          },
        ],
      }}
      reviewLoadState={{ status: 'ready' }}
      sessionInfo={null}
      loadState={{ status: 'ready' }}
      question={null}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onOpenReviewQuestion={onOpenReviewQuestion}
      onFinalizeReview={onFinalizeReview}
    />,
  );

  await expect
    .element(screen.getByRole('heading', { name: 'Review & Submit' }))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Open question' }).click();
  expect(onOpenReviewQuestion).toHaveBeenCalledWith('q1');

  await screen.getByRole('button', { name: 'Submit exam' }).click();
  await expect
    .element(screen.getByRole('alertdialog', { name: 'Submit exam?' }))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Confirm submit' }).click();
  expect(onFinalizeReview).toHaveBeenCalledTimes(1);
});

test('falls back to onEndSession when onFinalizeReview is omitted in the review stage', async () => {
  const onEndSession = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={{
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'A sample exam review question stem',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
          },
        ],
      }}
      reviewLoadState={{ status: 'ready' }}
      sessionInfo={null}
      loadState={{ status: 'ready' }}
      question={null}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={onEndSession}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('heading', { name: 'Review & Submit' }))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Submit exam' }).click();
  await expect
    .element(screen.getByRole('alertdialog', { name: 'Submit exam?' }))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Confirm submit' }).click();
  expect(onEndSession).toHaveBeenCalledTimes(1);
});

test('renders active question branch with navigator and navigation callback', async () => {
  const onNavigateQuestion = vi.fn();
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
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
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      }}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'exam',
        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q1',
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
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onToggleMarkForReview={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
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
  expect(onNavigateQuestion).toHaveBeenCalledWith('q2');
});

test('renders Finish exam in the active exam-question header', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={null}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'exam',
        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q1',
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
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onToggleMarkForReview={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: 'Finish exam' }))
    .toBeVisible();
});

test('wires navigator aria-controls to an existing question panel id', async () => {
  await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
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
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      }}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'exam',
        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q1',
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
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onToggleMarkForReview={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onNavigateQuestion={() => undefined}
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

test('renders Previous button in the session answering branch', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            slug: 'q-2',
            order: 2,
            isAvailable: true,
            stemMd: 'Stem 2',
            difficulty: 'medium',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      }}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'medium',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onNavigateQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: 'Previous' }))
    .toBeVisible();
});

test('hasPreviousQuestion is false when current question is first in navigator', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            slug: 'q-2',
            order: 2,
            isAvailable: true,
            stemMd: 'Stem 2',
            difficulty: 'medium',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      }}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q1',
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
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onNavigateQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: 'Previous' }))
    .not.toBeInTheDocument();
});

test('hasPreviousQuestion is false on the first question when navigator is missing', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={null}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q-missing',
        slug: 'q-missing',
        stemMd: 'Stem missing',
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
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onNavigateQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: 'Previous' }))
    .not.toBeInTheDocument();
});

test('renders Previous when navigator is missing but sessionInfo indicates a prior question exists, but keeps it disabled until the target resolves', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={null}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'medium',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onNavigateQuestion={() => undefined}
    />,
  );

  const previousButton = screen.getByRole('button', { name: 'Previous' });
  await expect.element(previousButton).toBeVisible();
  await expect.element(previousButton).toBeDisabled();
});

test('routes the last exam-question footer Next button through onEndSession instead of onNextQuestion', async () => {
  const onEndSession = vi.fn();
  const onNextQuestion = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={createReviewResponse({
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          createReviewRow({
            questionId: 'q1',
            order: 1,
            isAnswered: true,
            isCorrect: true,
          }),
          createReviewRow({
            questionId: 'q2',
            order: 2,
            isAnswered: true,
            isCorrect: true,
          }),
        ],
      })}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'exam',
        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={createNextQuestion({
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Last exam question',
        difficulty: 'medium',
      })}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={onEndSession}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onToggleMarkForReview={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={onNextQuestion}
      onNavigateQuestion={() => undefined}
    />,
  );

  await screen.getByRole('button', { name: 'Next' }).click();
  expect(onEndSession).toHaveBeenCalledTimes(1);
  expect(onNextQuestion).not.toHaveBeenCalled();
});

test('hasPreviousQuestion is true when current question is not first', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            slug: 'q-2',
            order: 2,
            isAvailable: true,
            stemMd: 'Stem 2',
            difficulty: 'medium',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      }}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'medium',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onNavigateQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: 'Previous' }))
    .not.toBeDisabled();
});

test('hasNextQuestion is false when current question is last available', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            slug: 'q-2',
            order: 2,
            isAvailable: true,
            stemMd: 'Stem 2',
            difficulty: 'medium',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      }}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'medium',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onNavigateQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: 'Next' }))
    .not.toBeInTheDocument();
});

test('clicking Next in a completed session navigates to the next available question id', async () => {
  const onNavigateQuestion = vi.fn();
  const onNextQuestion = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={createReviewResponse({
        mode: 'tutor',
        totalCount: 4,
        answeredCount: 4,
        markedCount: 0,
        rows: [
          createReviewRow({
            questionId: 'q1',
            order: 1,
            isAnswered: true,
            isCorrect: true,
          }),
          createReviewRow({
            questionId: 'q2',
            order: 2,
            isAnswered: true,
            isCorrect: true,
          }),
          createReviewRow({
            questionId: 'q3',
            order: 3,
            isAnswered: true,
            isCorrect: true,
          }),
          createReviewRow({
            questionId: 'q4',
            order: 4,
            isAnswered: true,
            isCorrect: true,
          }),
        ],
      })}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 1,
        total: 4,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={createNextQuestion({
        questionId: 'q2',
        stemMd: 'Stem 2',
        session: {
          sessionId: 'session-1',
          mode: 'tutor',
          index: 1,
          total: 4,
          isMarkedForReview: false,
          latestSelectedChoiceId: 'choice_1',
          latestIsCorrect: true,
        },
      })}
      selectedChoiceId="choice_1"
      isAnswered={true}
      submitResult={{
        attemptId: 'attempt-2',
        isCorrect: true,
        correctChoiceId: 'choice_1',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
      }}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={onNextQuestion}
      onNavigateQuestion={onNavigateQuestion}
    />,
  );

  await screen.getByRole('button', { name: 'Next' }).click();

  expect(onNavigateQuestion).toHaveBeenCalledWith('q3');
  expect(onNextQuestion).not.toHaveBeenCalled();
});

test('clicking Next falls back to onNextQuestion when id-based navigation is unavailable', async () => {
  const onNextQuestion = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={createReviewResponse({
        mode: 'tutor',
        totalCount: 3,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          createReviewRow({
            questionId: 'q1',
            order: 1,
            isAnswered: true,
            isCorrect: true,
          }),
          createReviewRow({
            questionId: 'q2',
            order: 2,
            isAnswered: false,
            isCorrect: null,
          }),
          createReviewRow({
            questionId: 'q3',
            order: 3,
            isAnswered: false,
            isCorrect: null,
          }),
        ],
      })}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 0,
        total: 3,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={createNextQuestion({
        questionId: 'q1',
        stemMd: 'Stem 1',
        session: {
          sessionId: 'session-1',
          mode: 'tutor',
          index: 0,
          total: 3,
          isMarkedForReview: false,
          latestSelectedChoiceId: 'choice_1',
          latestIsCorrect: true,
        },
      })}
      selectedChoiceId="choice_1"
      isAnswered={true}
      submitResult={{
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: 'choice_1',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
      }}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={onNextQuestion}
    />,
  );

  await screen.getByRole('button', { name: 'Next' }).click();

  expect(onNextQuestion).toHaveBeenCalledTimes(1);
});

test("clicking Previous calls onNavigateQuestion with the previous question's ID", async () => {
  const onNavigateQuestion = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            slug: 'q-2',
            order: 2,
            isAvailable: true,
            stemMd: 'Stem 2',
            difficulty: 'medium',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      }}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'medium',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onNavigateQuestion={onNavigateQuestion}
    />,
  );

  await screen.getByRole('button', { name: 'Previous' }).click();
  expect(onNavigateQuestion).toHaveBeenCalledWith('q1');
});

test('renders review error actions with retry and end session escape hatch', async () => {
  const onRetryReview = vi.fn();
  const onEndSession = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      reviewLoadState={{ status: 'error', message: 'Review unavailable.' }}
      sessionInfo={null}
      loadState={{ status: 'ready' }}
      question={null}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={onEndSession}
      onRetryReview={onRetryReview}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await expect.element(screen.getByText('Review unavailable.')).toBeVisible();
  await screen.getByRole('button', { name: 'Try again' }).click();
  expect(onRetryReview).toHaveBeenCalledTimes(1);

  await screen.getByRole('button', { name: 'End session' }).click();
  expect(onEndSession).toHaveBeenCalledTimes(1);
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
        sessionId: 'session-1',
        mode: 'exam',
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
      canSubmit={false}
      onEndSession={() => undefined}
      onRetryNavigator={onRetryNavigator}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByText('Navigator unavailable.'))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Retry navigator' }).click();
  expect(onRetryNavigator).toHaveBeenCalledTimes(1);
});

test('calls onFinalizeReview instead of onEndSession when both are provided', async () => {
  const onFinalizeReview = vi.fn(async () => undefined);
  const onEndSession = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      reviewLoadState={{ status: 'error', message: 'Review unavailable.' }}
      sessionInfo={null}
      loadState={{ status: 'ready' }}
      question={null}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={onEndSession}
      onFinalizeReview={onFinalizeReview}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await screen.getByRole('button', { name: 'End session' }).click();
  expect(onFinalizeReview).toHaveBeenCalledTimes(1);
  expect(onEndSession).not.toHaveBeenCalled();
});
