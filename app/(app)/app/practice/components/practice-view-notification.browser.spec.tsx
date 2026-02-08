import type { ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
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

test('emits error-tone notification when bookmark feedback arrives in error state', async () => {
  notifyMock.mockReset();

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
      selectedChoiceId={null}
      submitResult={null}
      isPending={false}
      bookmarkStatus="error"
      isBookmarked
      bookmarkMessage="Failed to save bookmark. Please try again."
      bookmarkMessageVersion={1}
      canSubmit={false}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
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
      selectedChoiceId={null}
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
    />,
  );

  await expect.poll(() => notifyMock.mock.calls.length).toBe(1);
  expect(notifyMock).toHaveBeenCalledWith({
    message: 'Question bookmarked.',
    tone: 'success',
  });
});
