import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import { PracticeView } from './practice-view';

const { notifyMock } = vi.hoisted(() => ({
  notifyMock: vi.fn(),
}));

vi.mock('@/components/ui/notification-provider', () => ({
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
  useNotification: () => ({
    notify: notifyMock,
    dismiss: vi.fn(),
  }),
}));

function createBaseProps() {
  const question = createNextQuestion({
    questionId: 'question-1',
    slug: 'question-1',
    stemMd: 'What is the next best step?',
    difficulty: 'easy',
  });

  return {
    loadState: { status: 'ready' as const },
    question,
    selectedChoiceId: null,
    isAnswered: false,
    submitResult: null,
    isPending: false,
    isBookmarked: true,
    canSubmit: false,
    onTryAgain: () => undefined,
    onToggleBookmark: () => undefined,
    onSelectChoice: () => undefined,
    onSubmit: () => undefined,
    onNextQuestion: () => undefined,
  };
}

test('emits error-tone notification when bookmark feedback arrives in error state', async () => {
  notifyMock.mockReset();
  const baseProps = createBaseProps();

  await render(
    <PracticeView
      {...baseProps}
      bookmarkStatus="error"
      bookmarkMessage="Failed to save bookmark. Please try again."
      bookmarkMessageVersion={1}
    />,
  );

  await expect.poll(() => notifyMock.mock.calls.length).toBe(1);
  expect(notifyMock).toHaveBeenCalledWith({
    message: 'Failed to save bookmark. Please try again.',
    tone: 'error',
  });
});

test('emits success-tone notification when bookmark feedback arrives in non-error state', async () => {
  notifyMock.mockReset();
  const baseProps = createBaseProps();

  await render(
    <PracticeView
      {...baseProps}
      bookmarkStatus="idle"
      bookmarkMessage="Question bookmarked."
      bookmarkMessageVersion={1}
    />,
  );

  await expect.poll(() => notifyMock.mock.calls.length).toBe(1);
  expect(notifyMock).toHaveBeenCalledWith({
    message: 'Question bookmarked.',
    tone: 'success',
  });
});

test('does not emit duplicate notifications when bookmark status changes without a new message version', async () => {
  notifyMock.mockReset();
  const baseProps = createBaseProps();

  function Harness() {
    const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('error');

    useEffect(() => {
      setStatus('idle');
    }, []);

    return (
      <>
        <div data-testid="bookmark-status">{status}</div>
        <PracticeView
          {...baseProps}
          bookmarkStatus={status}
          bookmarkMessage="Failed to save bookmark. Please try again."
          bookmarkMessageVersion={1}
        />
      </>
    );
  }

  const screen = await render(<Harness />);
  await expect.poll(() => notifyMock.mock.calls.length).toBe(1);
  await expect
    .element(screen.getByTestId('bookmark-status'))
    .toHaveTextContent('idle');
  expect(notifyMock.mock.calls.length).toBe(1);
});
