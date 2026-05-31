import { useState } from 'react';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { NotificationProvider } from '@/components/ui/notification-provider';
import { PracticeView } from './practice-view';

const fixtureSession1Id = crypto.randomUUID();
const fixtureQuestion1Id = crypto.randomUUID();
const fixtureChoiceAId = crypto.randomUUID();
const fixtureChoiceBId = crypto.randomUUID();
const fixtureAttempt1Id = crypto.randomUUID();
const fixtureQuestion2Id = crypto.randomUUID();

function createTallMarkdown(label: string, paragraphCount: number) {
  return Array.from(
    { length: paragraphCount },
    (_, index) =>
      `${label} paragraph ${index + 1}. ${'Detailed supporting content '.repeat(14)}`,
  ).join('\n\n');
}

function ExamPracticeViewHarness(input: {
  onNextQuestion: () => void;
  onToggleMarkForReview: () => void;
}) {
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);

  return (
    <PracticeView
      sessionInfo={{
        sessionId: fixtureSession1Id,
        mode: 'exam',

        deadlineAt: '2099-05-22T12:02:24.000Z',

        index: 0,
        total: 10,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: fixtureQuestion1Id,
        slug: 'question-1',
        stemMd: 'What is the next best step?',
        difficulty: 'easy',
        choices: [
          {
            id: fixtureChoiceAId,
            label: 'A',
            textMd: 'Option A',
            sortOrder: 1,
          },
          {
            id: fixtureChoiceBId,
            label: 'B',
            textMd: 'Option B',
            sortOrder: 2,
          },
        ],
        session: null,
      }}
      selectedChoiceId={selectedChoiceId}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      isMarkingForReview={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onToggleMarkForReview={input.onToggleMarkForReview}
      onSelectChoice={setSelectedChoiceId}
      onNextQuestion={input.onNextQuestion}
    />
  );
}

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
      onTryAgain={onTryAgain}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
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
  const onNextQuestion = vi.fn();

  const screen = await render(
    <ExamPracticeViewHarness
      onNextQuestion={onNextQuestion}
      onToggleMarkForReview={onToggleMarkForReview}
    />,
  );

  const headerActions = screen.getByTestId('question-header-actions');
  await headerActions.getByRole('button', { name: 'Mark for review' }).click();
  expect(onToggleMarkForReview).toHaveBeenCalledTimes(1);

  await expect
    .element(screen.getByRole('button', { name: 'Bookmark' }))
    .not.toBeInTheDocument();

  await screen.getByRole('radio', { name: 'Option B' }).click();
  await expect
    .element(screen.getByRole('radio', { name: 'Option B' }))
    .toBeChecked();

  await expect
    .element(screen.getByRole('button', { name: 'Submit' }))
    .not.toBeInTheDocument();

  await screen.getByRole('button', { name: 'Next' }).click();
  expect(onNextQuestion).toHaveBeenCalledTimes(1);
});

test('renders the exam bottom action bar without sticky shell markers', async () => {
  const screen = await render(
    <PracticeView
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
        questionId: fixtureQuestion1Id,
        slug: 'question-1',
        stemMd: createTallMarkdown('Exam stem', 36),
        difficulty: 'easy',
        choices: Array.from({ length: 6 }, (_, index) => ({
          id: crypto.randomUUID(),
          label: String.fromCharCode(65 + index),
          textMd: `Option ${index + 1}`,
          sortOrder: index + 1,
        })),
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      isMarkingForReview={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onToggleMarkForReview={() => undefined}
      onSelectChoice={() => undefined}
      onNextQuestion={() => undefined}
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
    .element(
      screen
        .getByTestId('bottom-action-bar')
        .getByRole('button', { name: 'Next' }),
    )
    .toBeVisible();
  await expect
    .element(
      screen
        .getByTestId('bottom-action-bar')
        .getByRole('button', { name: 'Mark for review' }),
    )
    .not.toBeInTheDocument();
  await expect
    .element(
      screen
        .getByTestId('question-header-actions')
        .getByRole('button', { name: 'Mark for review' }),
    )
    .toBeVisible();
});

test('renders the tutor feedback bottom action bar without sticky shell markers', async () => {
  const screen = await render(
    <PracticeView
      loadState={{ status: 'ready' }}
      question={{
        questionId: fixtureQuestion1Id,
        slug: 'question-1',
        stemMd: createTallMarkdown('Tutor stem', 18),
        difficulty: 'easy',
        choices: [
          {
            id: fixtureChoiceAId,
            label: 'A',
            textMd: 'Option A',
            sortOrder: 1,
          },
          {
            id: fixtureChoiceBId,
            label: 'B',
            textMd: 'Option B',
            sortOrder: 2,
          },
        ],
        session: null,
      }}
      selectedChoiceId={fixtureChoiceAId}
      isAnswered={true}
      submitResult={{
        attemptId: fixtureAttempt1Id,
        isCorrect: false,
        correctChoiceId: fixtureChoiceBId,
        explanationMd: createTallMarkdown('Tutor explanation', 24),
        referenceMd: createTallMarkdown('Tutor reference', 8),
        choiceExplanations: [
          {
            choiceId: fixtureChoiceAId,
            displayLabel: 'A',
            textMd: 'Option A',
            isCorrect: false,
            explanationMd: createTallMarkdown('Choice A explanation', 8),
          },
          {
            choiceId: fixtureChoiceBId,
            displayLabel: 'B',
            textMd: 'Option B',
            isCorrect: true,
            explanationMd: createTallMarkdown('Choice B explanation', 8),
          },
        ],
      }}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onNextQuestion={() => undefined}
      onPreviousQuestion={() => undefined}
      hasPreviousQuestion={true}
      hasNextQuestion={true}
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
    .element(screen.getByRole('button', { name: 'Previous' }))
    .toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Next' }))
    .toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Bookmark' }))
    .toBeVisible();
});

test('disables mutation controls while internal question loading is in progress', async () => {
  const tutorScreen = await render(
    <PracticeView
      loadState={{ status: 'loading' }}
      question={{
        questionId: fixtureQuestion1Id,
        slug: 'question-1',
        stemMd: 'What is the next best step?',
        difficulty: 'easy',
        choices: [
          {
            id: fixtureChoiceAId,
            label: 'A',
            textMd: 'Tutor Option A',
            sortOrder: 1,
          },
        ],
        session: null,
      }}
      selectedChoiceId={fixtureChoiceAId}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await expect
    .element(tutorScreen.getByRole('button', { name: 'Submit' }))
    .not.toBeInTheDocument();
  await expect
    .element(tutorScreen.getByRole('button', { name: 'Bookmark' }))
    .not.toBeInTheDocument();
  await expect
    .element(tutorScreen.getByRole('radio', { name: 'Tutor Option A' }))
    .toBeDisabled();

  const examScreen = await render(
    <PracticeView
      sessionInfo={{
        sessionId: fixtureSession1Id,
        mode: 'exam',

        deadlineAt: '2099-05-22T12:02:24.000Z',

        index: 0,
        total: 10,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'loading' }}
      question={{
        questionId: fixtureQuestion1Id,
        slug: 'question-1',
        stemMd: 'What is the next best step?',
        difficulty: 'easy',
        choices: [
          {
            id: fixtureChoiceAId,
            label: 'A',
            textMd: 'Exam Option A',
            sortOrder: 1,
          },
        ],
        session: null,
      }}
      selectedChoiceId={fixtureChoiceAId}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      isMarkingForReview={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onToggleMarkForReview={() => undefined}
      onSelectChoice={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await expect
    .element(
      examScreen
        .getByTestId('question-header-actions')
        .getByRole('button', { name: 'Mark for review' }),
    )
    .toBeDisabled();
  await expect
    .element(examScreen.getByRole('radio', { name: 'Exam Option A' }))
    .toBeDisabled();
});

test('disables choice selection after a submit in exam mode', async () => {
  const screen = await render(
    <PracticeView
      sessionInfo={{
        sessionId: fixtureSession1Id,
        mode: 'exam',

        deadlineAt: '2099-05-22T12:02:24.000Z',

        index: 0,
        total: 10,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: fixtureQuestion1Id,
        slug: 'question-1',
        stemMd: 'What is the next best step?',
        difficulty: 'easy',
        choices: [
          {
            id: fixtureChoiceAId,
            label: 'A',
            textMd: 'Option A',
            sortOrder: 1,
          },
          {
            id: fixtureChoiceBId,
            label: 'B',
            textMd: 'Option B',
            sortOrder: 2,
          },
        ],
        session: null,
      }}
      selectedChoiceId={fixtureChoiceAId}
      isAnswered={false}
      submitResult={{
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
        correctChoiceId: fixtureChoiceAId,
        explanationMd: 'Because',
        referenceMd: null,
        choiceExplanations: [],
      }}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onToggleMarkForReview={() => undefined}
      onSelectChoice={() => undefined}
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
          questionId: fixtureQuestion1Id,
          slug: 'question-1',
          stemMd: 'What is the next best step?',
          difficulty: 'easy',
          choices: [
            {
              id: fixtureChoiceAId,
              label: 'A',
              textMd: 'Option A',
              sortOrder: 1,
            },
          ],
          session: null,
        }}
        selectedChoiceId={fixtureChoiceAId}
        isAnswered={true}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: fixtureChoiceAId,
          explanationMd: 'Because',
          referenceMd: null,
          choiceExplanations: [],
        }}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
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
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 10,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={{
          questionId: fixtureQuestion1Id,
          slug: 'question-1',
          stemMd: 'What is the next best step?',
          difficulty: 'easy',
          choices: [
            {
              id: fixtureChoiceAId,
              label: 'A',
              textMd: 'Option A',
              sortOrder: 1,
            },
          ],
          session: null,
        }}
        selectedChoiceId={fixtureChoiceAId}
        isAnswered={true}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: fixtureChoiceAId,
          explanationMd: 'Because',
          referenceMd: null,
          choiceExplanations: [],
        }}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
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
          questionId: fixtureQuestion1Id,
          slug: 'question-1',
          stemMd: 'What is the next best step?',
          difficulty: 'easy',
          choices: [
            {
              id: fixtureChoiceAId,
              label: 'A',
              textMd: 'Option A',
              sortOrder: 1,
            },
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
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
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
        questionId: fixtureQuestion1Id,
        slug: 'question-1',
        stemMd: 'What is the next best step?',
        difficulty: 'easy',
        choices: [
          {
            id: fixtureChoiceAId,
            label: 'A',
            textMd: 'Option A',
            sortOrder: 1,
          },
        ],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onNextQuestion={() => undefined}
      onPreviousQuestion={onPreviousQuestion}
      hasPreviousQuestion
    />,
  );

  await screen.getByRole('button', { name: 'Previous' }).click();
  expect(onPreviousQuestion).toHaveBeenCalledTimes(1);
});

test('calls onEndSession from the bottom-bar Review & Submit button on the last exam question', async () => {
  const onEndSession = vi.fn();

  const screen = await render(
    <PracticeView
      sessionInfo={{
        sessionId: fixtureSession1Id,
        mode: 'exam',

        deadlineAt: '2099-05-22T12:02:24.000Z',

        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: fixtureQuestion2Id,
        slug: 'question-2',
        stemMd: 'What is the next best step?',
        difficulty: 'easy',
        choices: [
          {
            id: fixtureChoiceAId,
            label: 'A',
            textMd: 'Option A',
            sortOrder: 1,
          },
        ],
        session: null,
      }}
      selectedChoiceId={fixtureChoiceAId}
      isAnswered={true}
      submitResult={{
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
        correctChoiceId: fixtureChoiceAId,
        explanationMd: 'Because',
        referenceMd: null,
        choiceExplanations: [],
      }}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      onEndSession={onEndSession}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onToggleMarkForReview={() => undefined}
      onSelectChoice={() => undefined}
      onNextQuestion={() => undefined}
      onPreviousQuestion={() => undefined}
      hasPreviousQuestion
      hasNextQuestion={false}
    />,
  );

  await screen
    .getByTestId('exam-action-primary-group')
    .getByRole('button', { name: 'Review & Submit' })
    .click();
  expect(onEndSession).toHaveBeenCalledTimes(1);
});

test('calls onEndSession from the bottom-bar End session button on the last tutor question', async () => {
  const onEndSession = vi.fn();
  const onNextQuestion = vi.fn();

  const screen = await render(
    <PracticeView
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
        questionId: fixtureQuestion2Id,
        slug: 'question-2',
        stemMd: 'What is the next best step?',
        difficulty: 'easy',
        choices: [
          {
            id: fixtureChoiceAId,
            label: 'A',
            textMd: 'Option A',
            sortOrder: 1,
          },
        ],
        session: null,
      }}
      selectedChoiceId={fixtureChoiceAId}
      isAnswered={true}
      submitResult={{
        attemptId: fixtureAttempt1Id,
        isCorrect: true,
        correctChoiceId: fixtureChoiceAId,
        explanationMd: 'Because',
        referenceMd: null,
        choiceExplanations: [],
      }}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      onEndSession={onEndSession}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onNextQuestion={onNextQuestion}
      onPreviousQuestion={() => undefined}
      hasPreviousQuestion
      hasNextQuestion={false}
    />,
  );

  const primaryGroup = screen.getByTestId('tutor-action-primary-group');
  const secondaryGroup = screen.getByTestId('tutor-action-secondary-group');

  await expect.element(primaryGroup).toBeVisible();
  await expect.element(secondaryGroup).toBeVisible();
  await expect
    .element(primaryGroup.getByRole('button', { name: 'End session' }))
    .toBeVisible();
  await expect
    .element(secondaryGroup.getByRole('button', { name: 'Bookmark' }))
    .toBeVisible();

  await primaryGroup.getByRole('button', { name: 'End session' }).click();
  expect(onEndSession).toHaveBeenCalledTimes(1);
  expect(onNextQuestion).not.toHaveBeenCalled();
});
