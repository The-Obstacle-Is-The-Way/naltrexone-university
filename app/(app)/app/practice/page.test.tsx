// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('unexpected redirect');
  },
}));

describe('app/(app)/app/practice', () => {
  it('renders a practice shell', async () => {
    const PracticePage = (await import('@/app/(app)/app/practice/page'))
      .default;

    const html = renderToStaticMarkup(<PracticePage />);
    expect(html).toContain('Practice');
    expect(html).toContain('Back to Dashboard');
  });

  it('renders an error banner when loadState is error', async () => {
    const { PracticeView } = await import('@/app/(app)/app/practice/page');

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'error', message: 'Nope' }}
        question={null}
        selectedChoiceId={null}
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
      />,
    );

    expect(html).toContain('Nope');
    expect(html).toContain('Try again');
  });

  it('renders a loading banner when loadState is loading', async () => {
    const { PracticeView } = await import('@/app/(app)/app/practice/page');

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'loading' }}
        question={null}
        selectedChoiceId={null}
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
      />,
    );

    expect(html).toContain('Loading question');
  });

  it('renders empty state when no question remains', async () => {
    const { PracticeView } = await import('@/app/(app)/app/practice/page');

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
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
      />,
    );

    expect(html).toContain('No more questions found.');
  });

  it('renders bookmark control when question is present', async () => {
    const { PracticeView } = await import('@/app/(app)/app/practice/page');

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={{
          questionId: 'question-1',
          slug: 'question-1',
          stemMd: 'Stem',
          difficulty: 'easy',
          choices: [
            {
              id: 'choice-1',
              label: 'A',
              textMd: 'Choice',
              sortOrder: 1,
            },
          ],
          session: null,
        }}
        selectedChoiceId={null}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).toContain('Bookmarked');
  });

  it('renders feedback when submitResult is present', async () => {
    const { PracticeView } = await import('@/app/(app)/app/practice/page');

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={{
          attemptId: 'attempt-1',
          isCorrect: false,
          correctChoiceId: 'choice-1',
          explanationMd: 'Explanation',
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

    expect(html).toContain('Explanation');
  });

  it('renders a bookmark warning when bookmarkStatus is error', async () => {
    const { PracticeView } = await import('@/app/(app)/app/practice/page');

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={{
          questionId: 'question-1',
          slug: 'question-1',
          stemMd: 'Stem',
          difficulty: 'easy',
          choices: [
            {
              id: 'choice-1',
              label: 'A',
              textMd: 'Choice',
              sortOrder: 1,
            },
          ],
          session: null,
        }}
        selectedChoiceId={null}
        submitResult={null}
        isPending={false}
        bookmarkStatus="error"
        isBookmarked={false}
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).toContain('Bookmarks unavailable');
  });

  it('renders session info when sessionInfo is provided', async () => {
    const { PracticeView } = await import('@/app/(app)/app/practice/page');

    const html = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: 'session-1',
          mode: 'tutor',
          index: 0,
          total: 10,
        }}
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
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

    expect(html).toContain('Session: tutor');
    expect(html).toContain('1/10');
  });

  it('renders session start error when starter is in error state', async () => {
    const { PracticeSessionStarter } = await import(
      '@/app/(app)/app/practice/page'
    );

    const html = renderToStaticMarkup(
      <PracticeSessionStarter
        sessionMode="tutor"
        sessionCount={20}
        filters={{ tagSlugs: [], difficulties: [] }}
        tagLoadStatus="idle"
        availableTags={[]}
        sessionStartStatus="error"
        sessionStartError="No questions"
        isPending={false}
        onToggleDifficulty={() => undefined}
        onTagSlugsChange={() => undefined}
        onSessionModeChange={() => undefined}
        onSessionCountChange={() => undefined}
        onStartSession={() => undefined}
      />,
    );

    expect(html).toContain('No questions');
  });

  it('navigateTo calls window.location.assign', async () => {
    const { navigateTo } = await import(
      '@/app/(app)/app/practice/client-navigation'
    );

    const assign = vi.fn();
    navigateTo('#practice-nav-test', { assign });

    expect(assign).toHaveBeenCalledWith('#practice-nav-test');
  });
});
