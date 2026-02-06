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
  }, 20_000);

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

    expect(html).toContain('Remove bookmark');
  });

  it('renders mark-for-review control in exam sessions', async () => {
    const { PracticeView } = await import('@/app/(app)/app/practice/page');

    const html = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: 'session-1',
          mode: 'exam',
          index: 0,
          total: 10,
          isMarkedForReview: true,
        }}
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
        isBookmarked={false}
        isMarkingForReview={false}
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

    expect(html).toContain('Unmark review');
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

    expect(html).toContain('Explanation');
  });

  it('does not render feedback in exam mode', async () => {
    const { PracticeView } = await import('@/app/(app)/app/practice/page');

    const html = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: 'session-1',
          mode: 'exam',
          index: 0,
          total: 10,
        }}
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={{
          attemptId: 'attempt-1',
          isCorrect: false,
          correctChoiceId: 'choice-1',
          explanationMd: null,
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
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).not.toContain('Explanation not available.');
    expect(html).not.toContain('Incorrect');
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
        onToggleTag={() => undefined}
        onSessionModeChange={() => undefined}
        onSessionCountChange={() => undefined}
        onStartSession={() => undefined}
      />,
    );

    expect(html).toContain('No questions');
  });

  it('renders loading text when starter is in loading state', async () => {
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
        sessionStartStatus="loading"
        sessionStartError={null}
        isPending={false}
        onToggleDifficulty={() => undefined}
        onToggleTag={() => undefined}
        onSessionModeChange={() => undefined}
        onSessionCountChange={() => undefined}
        onStartSession={() => undefined}
      />,
    );

    expect(html).toContain('Starting…');
  });

  it('renders incomplete session card content', async () => {
    const { IncompleteSessionCard } = await import(
      '@/app/(app)/app/practice/page'
    );

    const html = renderToStaticMarkup(
      <IncompleteSessionCard
        session={{
          sessionId: '11111111-1111-1111-1111-111111111111',
          mode: 'exam',
          answeredCount: 5,
          totalCount: 20,
          startedAt: '2026-02-05T00:00:00.000Z',
        }}
        isPending={false}
        onAbandon={() => undefined}
      />,
    );

    expect(html).toContain('Continue session');
    expect(html).toContain('Exam mode');
    expect(html).toContain('5/20 answered');
    expect(html).toContain('Resume session');
    expect(html).toContain('Abandon session');
  });

  it('renders tag chips grouped by kind when tags are available', async () => {
    const { PracticeSessionStarter } = await import(
      '@/app/(app)/app/practice/page'
    );

    const html = renderToStaticMarkup(
      <PracticeSessionStarter
        sessionMode="tutor"
        sessionCount={20}
        filters={{ tagSlugs: ['topic-1'], difficulties: ['easy'] }}
        tagLoadStatus="idle"
        availableTags={[
          { id: 'tag-1', slug: 'domain-1', name: 'Domain 1', kind: 'domain' },
          { id: 'tag-2', slug: 'topic-1', name: 'Topic 1', kind: 'topic' },
        ]}
        sessionStartStatus="idle"
        sessionStartError={null}
        isPending={false}
        onToggleDifficulty={() => undefined}
        onToggleTag={() => undefined}
        onSessionModeChange={() => undefined}
        onSessionCountChange={() => undefined}
        onStartSession={() => undefined}
      />,
    );

    expect(html).toContain('Exam Section');
    expect(html).toContain('Topic');
    expect(html).toContain('Domain 1');
    expect(html).toContain('Topic 1');
  });

  it('renders segmented control for mode selection', async () => {
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
        sessionStartStatus="idle"
        sessionStartError={null}
        isPending={false}
        onToggleDifficulty={() => undefined}
        onToggleTag={() => undefined}
        onSessionModeChange={() => undefined}
        onSessionCountChange={() => undefined}
        onStartSession={() => undefined}
      />,
    );

    expect(html).toContain('Tutor');
    expect(html).toContain('Exam');
    expect(html).toContain('<fieldset');
  });

  it('renders difficulty filter chips', async () => {
    const { PracticeSessionStarter } = await import(
      '@/app/(app)/app/practice/page'
    );

    const html = renderToStaticMarkup(
      <PracticeSessionStarter
        sessionMode="tutor"
        sessionCount={20}
        filters={{ tagSlugs: [], difficulties: ['easy'] }}
        tagLoadStatus="idle"
        availableTags={[]}
        sessionStartStatus="idle"
        sessionStartError={null}
        isPending={false}
        onToggleDifficulty={() => undefined}
        onToggleTag={() => undefined}
        onSessionModeChange={() => undefined}
        onSessionCountChange={() => undefined}
        onStartSession={() => undefined}
      />,
    );

    expect(html).toContain('Easy');
    expect(html).toContain('Medium');
    expect(html).toContain('Hard');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  it('renders recent session history rows', async () => {
    const { PracticeSessionHistoryPanel } = await import(
      '@/app/(app)/app/practice/page'
    );

    const html = renderToStaticMarkup(
      <PracticeSessionHistoryPanel
        status="idle"
        error={null}
        rows={[
          {
            sessionId: 'session-1',
            mode: 'exam',
            questionCount: 20,
            answered: 20,
            correct: 15,
            accuracy: 0.75,
            durationSeconds: 1800,
            startedAt: '2026-02-05T00:00:00.000Z',
            endedAt: '2026-02-05T00:30:00.000Z',
          },
        ]}
        selectedSessionId={null}
        selectedReview={null}
        reviewStatus={{ status: 'idle' }}
        onOpenSession={() => undefined}
      />,
    );

    expect(html).toContain('Recent sessions');
    expect(html).toContain('Exam');
    expect(html).toContain('15/20 correct (75%)');
    expect(html).toContain('1800s');
  });

  it('renders selected session question breakdown', async () => {
    const { PracticeSessionHistoryPanel } = await import(
      '@/app/(app)/app/practice/page'
    );

    const html = renderToStaticMarkup(
      <PracticeSessionHistoryPanel
        status="idle"
        error={null}
        rows={[]}
        selectedSessionId="session-1"
        selectedReview={{
          sessionId: 'session-1',
          mode: 'exam',
          totalCount: 2,
          answeredCount: 1,
          markedCount: 0,
          rows: [
            {
              isAvailable: true,
              questionId: 'q1',
              stemMd: 'Stem for q1',
              difficulty: 'easy',
              order: 1,
              isAnswered: true,
              isCorrect: false,
              markedForReview: false,
            },
            {
              isAvailable: false,
              questionId: 'q2',
              order: 2,
              isAnswered: false,
              isCorrect: null,
              markedForReview: false,
            },
          ],
        }}
        reviewStatus={{ status: 'ready' }}
        onOpenSession={() => undefined}
      />,
    );

    expect(html).toContain('Session breakdown');
    expect(html).toContain('Stem for q1');
    expect(html).toContain('[Question no longer available]');
    expect(html).toContain('Incorrect');
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
