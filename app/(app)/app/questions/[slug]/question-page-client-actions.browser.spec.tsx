import type { ComponentPropsWithoutRef, PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { QuestionView } from './question-page-client';
import { createBaseProps } from './question-page-client-test-helpers';

type LinkProps = PropsWithChildren<
  { href: string } & Omit<ComponentPropsWithoutRef<'a'>, 'href'>
>;

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: LinkProps) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const question = {
  questionId: crypto.randomUUID(),
  slug: 'q1',
  stemMd: 'Question stem',
  difficulty: 'easy' as const,
  choices: [
    { id: 'c1', label: 'A', textMd: 'Choice A' },
    { id: 'c2', label: 'B', textMd: 'Choice B' },
  ],
};

const correctResult = {
  attemptId: crypto.randomUUID(),
  isCorrect: true,
  correctChoiceId: 'c1',
  explanationMd: 'Explanation',
  referenceMd: null,
  choiceExplanations: [],
};

// Each case clicks the rendered control and asserts the callback it wires,
// which the static-markup suites cannot observe.
describe('QuestionView event wiring (browser)', () => {
  it('retries a failed question load from the error card', async () => {
    const onTryAgain = vi.fn();
    const screen = await render(
      <QuestionView
        {...createBaseProps()}
        loadState={{ status: 'error', message: 'Could not load question.' }}
        onTryAgain={onTryAgain}
      />,
    );

    await screen.getByRole('button', { name: 'Try again' }).click();

    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });

  it('retries loading the previous answer after a review hydration error', async () => {
    const onTryAgain = vi.fn();
    const onAnswerAsNew = vi.fn();
    const screen = await render(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        question={question}
        reviewHydrationState="hydration_error"
        onTryAgain={onTryAgain}
        onAnswerAsNew={onAnswerAsNew}
      />,
    );

    await screen.getByRole('button', { name: 'Retry load' }).click();

    expect(onTryAgain).toHaveBeenCalledTimes(1);
    expect(onAnswerAsNew).not.toHaveBeenCalled();
  });

  it('answers as new after a review hydration error', async () => {
    const onTryAgain = vi.fn();
    const onAnswerAsNew = vi.fn();
    const screen = await render(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        question={question}
        reviewHydrationState="hydration_error"
        onTryAgain={onTryAgain}
        onAnswerAsNew={onAnswerAsNew}
      />,
    );

    await screen.getByRole('button', { name: 'Answer as new' }).click();

    expect(onAnswerAsNew).toHaveBeenCalledTimes(1);
    expect(onTryAgain).not.toHaveBeenCalled();
  });

  it('reports the chosen choice id and pointer origin when a choice is clicked', async () => {
    const onSelectChoice = vi.fn();
    const screen = await render(
      <QuestionView
        {...createBaseProps()}
        question={question}
        onSelectChoice={onSelectChoice}
      />,
    );

    await screen.getByText('Choice B').click();

    // QuestionSurfaceBody passes the selection origin along with the id.
    expect(onSelectChoice).toHaveBeenCalledWith('c2', 'pointer');
  });

  it('submits only once submission is allowed', async () => {
    const onSubmit = vi.fn();
    const props = {
      ...createBaseProps(),
      question,
      selectedChoiceId: 'c2',
      onSubmit,
    };
    const screen = await render(<QuestionView {...props} canSubmit={false} />);

    await expect
      .element(screen.getByRole('button', { name: 'Submit' }))
      .toBeDisabled();

    await screen.rerender(<QuestionView {...props} canSubmit={true} />);
    await screen.getByRole('button', { name: 'Submit' }).click();

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  function renderReviewedAnswer(handlers: {
    onReattempt: () => void;
    onToggleBookmark: () => void;
  }) {
    return render(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        question={question}
        submitResult={correctResult}
        isBookmarkHydrated={true}
        bookmarkStatus="idle"
        isBookmarked={false}
        {...handlers}
      />,
    );
  }

  it('reattempts from a reviewed answer', async () => {
    const onReattempt = vi.fn();
    const onToggleBookmark = vi.fn();
    const screen = await renderReviewedAnswer({
      onReattempt,
      onToggleBookmark,
    });

    await screen.getByRole('button', { name: 'Practice Again' }).click();

    expect(onReattempt).toHaveBeenCalledTimes(1);
    expect(onToggleBookmark).not.toHaveBeenCalled();
  });

  it('toggles the bookmark from a reviewed answer', async () => {
    const onReattempt = vi.fn();
    const onToggleBookmark = vi.fn();
    const screen = await renderReviewedAnswer({
      onReattempt,
      onToggleBookmark,
    });

    await screen.getByRole('button', { name: 'Bookmark' }).click();

    expect(onToggleBookmark).toHaveBeenCalledTimes(1);
    expect(onReattempt).not.toHaveBeenCalled();
  });

  it('opens the question report dialog through its trigger', async () => {
    const openReport = vi.fn();
    const screen = await render(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        question={question}
        submitResult={correctResult}
        questionFeedback={{
          rating: null,
          feedbackStatus: 'idle',
          onRate: () => undefined,
          isReportOpen: false,
          openReport,
          submitReport: async () => true,
        }}
      />,
    );

    await screen.getByRole('button', { name: 'Give feedback' }).click();

    expect(openReport).toHaveBeenCalledWith(true);
  });
});
