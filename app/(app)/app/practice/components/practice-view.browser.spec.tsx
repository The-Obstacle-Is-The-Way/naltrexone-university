import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { NotificationProvider } from '@/components/ui/notification-provider';
import { PracticeView } from './practice-view';

test('renders error state and retries when requested', async () => {
  const onTryAgain = vi.fn();

  const screen = await render(
    <PracticeView
      loadState={{ status: 'error', message: 'Question load failed.' }}
      question={null}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onTryAgain={onTryAgain}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await expect.element(screen.getByText('Question load failed.')).toBeVisible();
  await screen.getByRole('button', { name: 'Try again' }).click();
  expect(onTryAgain).toHaveBeenCalledTimes(1);
  await expect
    .element(screen.getByRole('link', { name: 'Return to dashboard' }))
    .toBeVisible();
});

test('supports exam controls and question interactions', async () => {
  const onToggleMarkForReview = vi.fn();
  const onSelectChoice = vi.fn();
  const onNextQuestion = vi.fn();

  const screen = await render(
    <PracticeView
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'exam',
        index: 0,
        total: 10,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'question-1',
        slug: 'question-1',
        stemMd: 'What is the next best step?',
        difficulty: 'easy',
        choices: [
          { id: 'choice_a', label: 'A', textMd: 'Option A', sortOrder: 1 },
          { id: 'choice_b', label: 'B', textMd: 'Option B', sortOrder: 2 },
        ],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      isMarkingForReview={false}
      canSubmit
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onToggleMarkForReview={onToggleMarkForReview}
      onSelectChoice={onSelectChoice}
      onSubmit={() => undefined}
      onNextQuestion={onNextQuestion}
    />,
  );

  await screen.getByRole('button', { name: 'Mark for review' }).click();
  expect(onToggleMarkForReview).toHaveBeenCalledTimes(1);

  await expect
    .element(screen.getByRole('button', { name: 'Bookmark' }))
    .not.toBeInTheDocument();

  await screen.getByRole('radio', { name: 'Option B' }).click();
  expect(onSelectChoice).toHaveBeenCalledWith('choice_b');

  await expect
    .element(screen.getByRole('button', { name: 'Submit' }))
    .not.toBeInTheDocument();

  await screen.getByRole('button', { name: 'Next' }).click();
  expect(onNextQuestion).toHaveBeenCalledTimes(1);
});

test('disables mutation controls while internal question loading is in progress', async () => {
  const tutorScreen = await render(
    <PracticeView
      loadState={{ status: 'loading' }}
      question={{
        questionId: 'question-1',
        slug: 'question-1',
        stemMd: 'What is the next best step?',
        difficulty: 'easy',
        choices: [
          { id: 'choice_a', label: 'A', textMd: 'Option A', sortOrder: 1 },
        ],
        session: null,
      }}
      selectedChoiceId="choice_a"
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={true}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await expect
    .element(tutorScreen.getByRole('button', { name: 'Submit' }))
    .toBeDisabled();
  await expect
    .element(tutorScreen.getByRole('button', { name: 'Bookmark' }))
    .toBeDisabled();

  const examScreen = await render(
    <PracticeView
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'exam',
        index: 0,
        total: 10,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'loading' }}
      question={{
        questionId: 'question-1',
        slug: 'question-1',
        stemMd: 'What is the next best step?',
        difficulty: 'easy',
        choices: [
          { id: 'choice_a', label: 'A', textMd: 'Option A', sortOrder: 1 },
        ],
        session: null,
      }}
      selectedChoiceId="choice_a"
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      isMarkingForReview={false}
      canSubmit={true}
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
    .element(examScreen.getByRole('button', { name: 'Mark for review' }))
    .toBeDisabled();
});

test('disables choice selection after a submit in exam mode', async () => {
  const screen = await render(
    <PracticeView
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'exam',
        index: 0,
        total: 10,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'question-1',
        slug: 'question-1',
        stemMd: 'What is the next best step?',
        difficulty: 'easy',
        choices: [
          { id: 'choice_a', label: 'A', textMd: 'Option A', sortOrder: 1 },
          { id: 'choice_b', label: 'B', textMd: 'Option B', sortOrder: 2 },
        ],
        session: null,
      }}
      selectedChoiceId="choice_a"
      isAnswered={false}
      submitResult={{
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: 'choice_a',
        explanationMd: 'Because',
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
      onToggleMarkForReview={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('radio', { name: 'Option A' }))
    .toBeDisabled();
  await expect
    .element(screen.getByRole('radio', { name: 'Option B' }))
    .toBeDisabled();
});

test('scrolls feedback into view when a submit result is present', async () => {
  const scrollIntoViewSpy = vi
    .spyOn(Element.prototype, 'scrollIntoView')
    .mockImplementation(() => undefined);

  try {
    await render(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={{
          questionId: 'question-1',
          slug: 'question-1',
          stemMd: 'What is the next best step?',
          difficulty: 'easy',
          choices: [
            { id: 'choice_a', label: 'A', textMd: 'Option A', sortOrder: 1 },
          ],
          session: null,
        }}
        selectedChoiceId="choice_a"
        isAnswered={true}
        submitResult={{
          attemptId: 'attempt-1',
          isCorrect: true,
          correctChoiceId: 'choice_a',
          explanationMd: 'Because',
          referenceMd: null,
          choiceExplanations: [],
        }}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    await vi.waitFor(() => {
      expect(scrollIntoViewSpy).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      });
    });
  } finally {
    scrollIntoViewSpy.mockRestore();
  }
});

test('does not scroll feedback in exam mode', async () => {
  const scrollIntoViewSpy = vi
    .spyOn(Element.prototype, 'scrollIntoView')
    .mockImplementation(() => undefined);

  try {
    await render(
      <PracticeView
        sessionInfo={{
          sessionId: 'session-1',
          mode: 'exam',
          index: 0,
          total: 10,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={{
          questionId: 'question-1',
          slug: 'question-1',
          stemMd: 'What is the next best step?',
          difficulty: 'easy',
          choices: [
            { id: 'choice_a', label: 'A', textMd: 'Option A', sortOrder: 1 },
          ],
          session: null,
        }}
        selectedChoiceId="choice_a"
        isAnswered={true}
        submitResult={{
          attemptId: 'attempt-1',
          isCorrect: true,
          correctChoiceId: 'choice_a',
          explanationMd: 'Because',
          referenceMd: null,
          choiceExplanations: [],
        }}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  } finally {
    scrollIntoViewSpy.mockRestore();
  }
});

test('renders bookmark feedback in shared toast region', async () => {
  const screen = await render(
    <NotificationProvider>
      <PracticeView
        loadState={{ status: 'ready' }}
        question={{
          questionId: 'question-1',
          slug: 'question-1',
          stemMd: 'What is the next best step?',
          difficulty: 'easy',
          choices: [
            { id: 'choice_a', label: 'A', textMd: 'Option A', sortOrder: 1 },
          ],
          session: null,
        }}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked
        bookmarkMessage="Question bookmarked."
        bookmarkMessageVersion={1}
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
      />
    </NotificationProvider>,
  );

  await expect
    .element(screen.getByTestId('app-toast-region'))
    .toBeInTheDocument();
  await expect.element(screen.getByText('Question bookmarked.')).toBeVisible();
});

test('calls onPreviousQuestion when clicked', async () => {
  const onPreviousQuestion = vi.fn();

  const screen = await render(
    <PracticeView
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'question-1',
        slug: 'question-1',
        stemMd: 'What is the next best step?',
        difficulty: 'easy',
        choices: [
          { id: 'choice_a', label: 'A', textMd: 'Option A', sortOrder: 1 },
        ],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onPreviousQuestion={onPreviousQuestion}
      hasPreviousQuestion
    />,
  );

  await screen.getByRole('button', { name: 'Previous' }).click();
  expect(onPreviousQuestion).toHaveBeenCalledTimes(1);
});

test('calls onEndSession from the bottom-bar Review answers button after the last exam answer', async () => {
  const onEndSession = vi.fn();

  const screen = await render(
    <PracticeView
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'exam',
        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'question-2',
        slug: 'question-2',
        stemMd: 'What is the next best step?',
        difficulty: 'easy',
        choices: [
          { id: 'choice_a', label: 'A', textMd: 'Option A', sortOrder: 1 },
        ],
        session: null,
      }}
      selectedChoiceId="choice_a"
      isAnswered={true}
      submitResult={{
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: 'choice_a',
        explanationMd: 'Because',
        referenceMd: null,
        choiceExplanations: [],
      }}
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
      onNextQuestion={() => undefined}
      onPreviousQuestion={() => undefined}
      hasPreviousQuestion
      hasNextQuestion={false}
    />,
  );

  await screen.getByRole('button', { name: 'Review answers' }).click();
  expect(onEndSession).toHaveBeenCalledTimes(1);
});
