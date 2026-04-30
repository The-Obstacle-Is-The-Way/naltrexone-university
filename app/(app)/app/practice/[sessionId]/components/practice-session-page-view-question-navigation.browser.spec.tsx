import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import {
  createReviewResponse,
  createReviewRow,
} from '../hooks/practice-session-page-controller.browser.fixtures';
import { PracticeSessionPageView } from './practice-session-page-view';
import { noop } from './practice-session-page-view-test-helpers';

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
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onSubmit={noop}
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
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onSubmit={noop}
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
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onSubmit={noop}
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
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onSubmit={noop}
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
      onTryAgain={noop}
      onToggleBookmark={noop}
      onToggleMarkForReview={noop}
      onSelectChoice={noop}
      onSubmit={noop}
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
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onSubmit={noop}
      onNextQuestion={noop}
      onNavigateQuestion={noop}
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
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onSubmit={noop}
      onNextQuestion={noop}
      onNavigateQuestion={noop}
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
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onSubmit={noop}
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
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onSubmit={noop}
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
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onSubmit={noop}
      onNextQuestion={noop}
      onNavigateQuestion={onNavigateQuestion}
    />,
  );

  await screen.getByRole('button', { name: 'Previous' }).click();
  expect(onNavigateQuestion).toHaveBeenCalledWith('q1');
});
