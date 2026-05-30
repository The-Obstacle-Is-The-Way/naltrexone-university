import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import {
  createReviewResponse,
  createReviewRow,
} from '../hooks/practice-session-page-controller.browser.fixtures';
import { PracticeSessionPageView } from './practice-session-page-view';
import { noop } from './practice-session-page-view-test-helpers';

const fixtureSession1Id = crypto.randomUUID();
const fixtureQMissingId = crypto.randomUUID();
const fixtureAttempt1Id = crypto.randomUUID();
const fixtureAttempt2Id = crypto.randomUUID();
const fixtureChoice1Id = crypto.randomUUID();
const fixtureQ1Id = crypto.randomUUID();
const fixtureQ2Id = crypto.randomUUID();
const fixtureQ3Id = crypto.randomUUID();
const fixtureQ4Id = crypto.randomUUID();

test('renders Previous button in the session answering branch', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: fixtureSession1Id,
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: fixtureQ1Id,
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: false,
            isCorrect: null,
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
        mode: 'tutor',

        deadlineAt: null,

        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: fixtureQ2Id,
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
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
      onNavigateQuestion={noop}
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
        sessionId: fixtureSession1Id,
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: fixtureQ1Id,
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: false,
            isCorrect: null,
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
      onSelectChoice={noop}
      onNextQuestion={noop}
      onNavigateQuestion={noop}
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
        sessionId: fixtureSession1Id,
        mode: 'tutor',

        deadlineAt: null,

        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: fixtureQMissingId,
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
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
      onNavigateQuestion={noop}
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
        sessionId: fixtureSession1Id,
        mode: 'tutor',

        deadlineAt: null,

        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: fixtureQ2Id,
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
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
      onNavigateQuestion={noop}
    />,
  );

  const previousButton = screen.getByRole('button', { name: 'Previous' });
  await expect.element(previousButton).toBeVisible();
  await expect.element(previousButton).toBeDisabled();
});

test('routes the last exam-question footer Review & Submit button through onEndSession instead of onNextQuestion', async () => {
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
            questionId: fixtureQ1Id,
            order: 1,
            isAnswered: true,
            isCorrect: true,
          }),
          createReviewRow({
            questionId: fixtureQ2Id,
            order: 2,
            isAnswered: true,
            isCorrect: true,
          }),
        ],
      })}
      sessionInfo={{
        sessionId: fixtureSession1Id,
        mode: 'exam',

        deadlineAt: '2099-05-22T12:02:24.000Z',

        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={createNextQuestion({
        questionId: fixtureQ2Id,
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
      onEndSession={onEndSession}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onToggleMarkForReview={noop}
      onSelectChoice={noop}
      onNextQuestion={onNextQuestion}
      onNavigateQuestion={noop}
    />,
  );

  await screen.getByRole('button', { name: 'Review & Submit' }).click();
  expect(onEndSession).toHaveBeenCalledTimes(1);
  expect(onNextQuestion).not.toHaveBeenCalled();
});

test('hasPreviousQuestion is true when current question is not first', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: fixtureSession1Id,
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: fixtureQ1Id,
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: false,
            isCorrect: null,
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
        mode: 'tutor',

        deadlineAt: null,

        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: fixtureQ2Id,
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
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
      onNavigateQuestion={noop}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: 'Previous' }))
    .not.toBeDisabled();
});

test('routes the last tutor-question footer End session button through onEndSession instead of onNextQuestion', async () => {
  const onEndSession = vi.fn();
  const onNextQuestion = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
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
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      }}
      sessionInfo={{
        sessionId: fixtureSession1Id,
        mode: 'tutor',

        deadlineAt: null,

        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: fixtureQ2Id,
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'medium',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId="c1"
      isAnswered={true}
      submitResult={{
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
        correctChoiceId: 'c1',
        explanationMd: 'Because',
        referenceMd: null,
        choiceExplanations: [],
      }}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      onEndSession={onEndSession}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onNextQuestion={onNextQuestion}
      onNavigateQuestion={noop}
    />,
  );

  const bottomActionBar = screen.getByTestId('bottom-action-bar');

  await expect
    .element(bottomActionBar.getByRole('button', { name: 'Next' }))
    .not.toBeInTheDocument();
  await expect
    .element(bottomActionBar.getByRole('button', { name: 'Previous' }))
    .toBeVisible();
  await bottomActionBar.getByRole('button', { name: 'End session' }).click();
  expect(onEndSession).toHaveBeenCalledTimes(1);
  expect(onNextQuestion).not.toHaveBeenCalled();
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
            questionId: fixtureQ1Id,
            order: 1,
            isAnswered: true,
            isCorrect: true,
          }),
          createReviewRow({
            questionId: fixtureQ2Id,
            order: 2,
            isAnswered: true,
            isCorrect: true,
          }),
          createReviewRow({
            questionId: fixtureQ3Id,
            order: 3,
            isAnswered: true,
            isCorrect: true,
          }),
          createReviewRow({
            questionId: fixtureQ4Id,
            order: 4,
            isAnswered: true,
            isCorrect: true,
          }),
        ],
      })}
      sessionInfo={{
        sessionId: fixtureSession1Id,
        mode: 'tutor',

        deadlineAt: null,

        index: 1,
        total: 4,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={createNextQuestion({
        questionId: fixtureQ2Id,
        stemMd: 'Stem 2',
        session: {
          sessionId: fixtureSession1Id,
          mode: 'tutor',

          deadlineAt: null,

          index: 1,
          total: 4,
          isMarkedForReview: false,
          latestSelectedChoiceId: fixtureChoice1Id,
          latestIsCorrect: true,
        },
      })}
      selectedChoiceId={fixtureChoice1Id}
      isAnswered={true}
      submitResult={{
        attemptId: fixtureAttempt2Id,
        isCorrect: true,
        correctChoiceId: fixtureChoice1Id,
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
      }}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onNextQuestion={onNextQuestion}
      onNavigateQuestion={onNavigateQuestion}
    />,
  );

  await screen.getByRole('button', { name: 'Next' }).click();

  expect(onNavigateQuestion).toHaveBeenCalledWith(fixtureQ3Id);
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
            questionId: fixtureQ1Id,
            order: 1,
            isAnswered: true,
            isCorrect: true,
          }),
          createReviewRow({
            questionId: fixtureQ2Id,
            order: 2,
            isAnswered: false,
            isCorrect: null,
          }),
          createReviewRow({
            questionId: fixtureQ3Id,
            order: 3,
            isAnswered: false,
            isCorrect: null,
          }),
        ],
      })}
      sessionInfo={{
        sessionId: fixtureSession1Id,
        mode: 'tutor',

        deadlineAt: null,

        index: 0,
        total: 3,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={createNextQuestion({
        questionId: fixtureQ1Id,
        stemMd: 'Stem 1',
        session: {
          sessionId: fixtureSession1Id,
          mode: 'tutor',

          deadlineAt: null,

          index: 0,
          total: 3,
          isMarkedForReview: false,
          latestSelectedChoiceId: fixtureChoice1Id,
          latestIsCorrect: true,
        },
      })}
      selectedChoiceId={fixtureChoice1Id}
      isAnswered={true}
      submitResult={{
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
        correctChoiceId: fixtureChoice1Id,
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
      }}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
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
        sessionId: fixtureSession1Id,
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: fixtureQ1Id,
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: false,
            isCorrect: null,
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
        mode: 'tutor',

        deadlineAt: null,

        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: fixtureQ2Id,
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
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
      onNavigateQuestion={onNavigateQuestion}
    />,
  );

  await screen.getByRole('button', { name: 'Previous' }).click();
  expect(onNavigateQuestion).toHaveBeenCalledWith(fixtureQ1Id);
});
