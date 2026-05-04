// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('unexpected redirect');
  },
}));

type PracticePageModule = typeof import('@/app/(app)/app/practice/page');
type PracticeNavigationModule =
  typeof import('@/app/(app)/app/practice/client-navigation');

let PracticePage: PracticePageModule['default'];
let PracticeView: PracticePageModule['PracticeView'];
let PracticeSessionStarter: PracticePageModule['PracticeSessionStarter'];
let IncompleteSessionCard: PracticePageModule['IncompleteSessionCard'];
let navigateTo: PracticeNavigationModule['navigateTo'];

beforeAll(async () => {
  const [pageModule, navigationModule] = await Promise.all([
    import('@/app/(app)/app/practice/page'),
    import('@/app/(app)/app/practice/client-navigation'),
  ]);
  PracticePage = pageModule.default;
  PracticeView = pageModule.PracticeView;
  PracticeSessionStarter = pageModule.PracticeSessionStarter;
  IncompleteSessionCard = pageModule.IncompleteSessionCard;
  navigateTo = navigationModule.navigateTo;
});

describe('app/(app)/app/practice', () => {
  it('renders a practice shell', () => {
    const html = renderToStaticMarkup(<PracticePage />);
    expect(html).toContain('Practice');
    expect(html).toContain('Back to Dashboard');
  });

  it('does not render a Quick Practice CTA card on the landing page', () => {
    const html = renderToStaticMarkup(<PracticePage />);
    expect(html).not.toContain(
      'No session tracking — just jump in and practice.',
    );
    expect(html).not.toContain('Quick Practice →');
  });

  it('renders an error banner when loadState is error', () => {
    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'error', message: 'Nope' }}
        question={null}
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
      />,
    );

    expect(html).toContain('Nope');
    expect(html).toContain('Try again');
  });

  it('renders a loading banner when loadState is loading', () => {
    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'loading' }}
        question={null}
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
      />,
    );

    expect(html).toContain('Loading question');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const output = doc.querySelector('output');
    expect(output).not.toBeNull();
    expect(output?.getAttribute('aria-live')).toBe('polite');
  });

  it('renders empty state when no question remains', () => {
    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={null}
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
      />,
    );

    expect(html).toContain('No more questions found.');
  });

  it('renders bookmark control when tutor feedback is present', () => {
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
        selectedChoiceId="choice-1"
        isAnswered={true}
        submitResult={{
          attemptId: 'attempt-1',
          isCorrect: true,
          correctChoiceId: 'choice-1',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).toContain('Remove bookmark');
  });

  it('renders mark-for-review control in exam sessions', () => {
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

    expect(html).toContain('Unmark review');
  });

  it('renders feedback when submitResult is present', () => {
    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={{
          attemptId: 'attempt-1',
          isCorrect: false,
          correctChoiceId: 'choice-1',
          explanationMd: 'Explanation',
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

    expect(html).toContain('Explanation');
  });

  it('does not render feedback in exam mode', () => {
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
        isAnswered={false}
        submitResult={{
          attemptId: 'attempt-1',
          isCorrect: false,
          correctChoiceId: 'choice-1',
          explanationMd: null,
          referenceMd: null,
          choiceExplanations: [],
        }}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).not.toContain('Explanation not available.');
    expect(html).not.toContain('Incorrect');
  });

  it('renders a bookmark warning when bookmarkStatus is error', () => {
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
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="error"
        isBookmarked={false}
        onRetryBookmarks={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).toContain('Bookmarks unavailable');
    expect(html).toContain('Retry bookmarks');
  });

  it('renders bookmark warning even before a question is loaded', () => {
    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="error"
        isBookmarked={false}
        onRetryBookmarks={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).toContain('Bookmarks unavailable');
    expect(html).toContain('Retry bookmarks');
  });

  it('renders custom title and description when provided', () => {
    const html = renderToStaticMarkup(
      <PracticeView
        title="Tutor Session"
        description="Question 1 of 10 — Explanations shown after each answer."
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).toContain('Tutor Session');
    expect(html).toContain('Question 1 of 10');
  });

  it('renders session start error when starter is in error state', () => {
    const html = renderToStaticMarkup(
      <PracticeSessionStarter
        sessionMode="tutor"
        sessionCount={20}
        filters={{ tagSlugs: [], difficulty: null, status: 'unanswered' }}
        availableCountStatus="idle"
        availableCount={null}
        tagLoadStatus="idle"
        availableTags={[]}
        sessionStartStatus="error"
        sessionStartError="No questions"
        onDifficultyChange={() => undefined}
        onStatusChange={() => undefined}
        onToggleTag={() => undefined}
        onSessionModeChange={() => undefined}
        onSessionCountChange={() => undefined}
        onStartSession={() => undefined}
      />,
    );

    expect(html).toContain('No questions');
  });

  it('renders loading text when starter is in loading state', () => {
    const html = renderToStaticMarkup(
      <PracticeSessionStarter
        sessionMode="tutor"
        sessionCount={20}
        filters={{ tagSlugs: [], difficulty: null, status: 'unanswered' }}
        availableCountStatus="idle"
        availableCount={null}
        tagLoadStatus="idle"
        availableTags={[]}
        sessionStartStatus="loading"
        sessionStartError={null}
        onDifficultyChange={() => undefined}
        onStatusChange={() => undefined}
        onToggleTag={() => undefined}
        onSessionModeChange={() => undefined}
        onSessionCountChange={() => undefined}
        onStartSession={() => undefined}
      />,
    );

    expect(html).toContain('Starting…');
  });

  it('renders incomplete session card content', () => {
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

  it('renders tag chips grouped by kind when tags are available', () => {
    const html = renderToStaticMarkup(
      <PracticeSessionStarter
        sessionMode="tutor"
        sessionCount={20}
        filters={{
          tagSlugs: ['topic-1', 'substance-1'],
          difficulty: 'easy',
          status: 'unanswered',
        }}
        availableCountStatus="idle"
        availableCount={null}
        tagLoadStatus="idle"
        availableTags={[
          { id: 'tag-1', slug: 'topic-1', name: 'Topic 1', kind: 'topic' },
          {
            id: 'tag-2',
            slug: 'substance-1',
            name: 'Substance 1',
            kind: 'substance',
          },
        ]}
        sessionStartStatus="idle"
        sessionStartError={null}
        onDifficultyChange={() => undefined}
        onStatusChange={() => undefined}
        onToggleTag={() => undefined}
        onSessionModeChange={() => undefined}
        onSessionCountChange={() => undefined}
        onStartSession={() => undefined}
      />,
    );

    expect(html).toContain('Topic');
    expect(html).toContain('Substance');
    expect(html).toContain('Topic 1');
    expect(html).toContain('Substance 1');
    expect(html).not.toContain('Exam Section');
  });

  it('renders segmented control for mode selection', () => {
    const html = renderToStaticMarkup(
      <PracticeSessionStarter
        sessionMode="tutor"
        sessionCount={20}
        filters={{ tagSlugs: [], difficulty: null, status: 'unanswered' }}
        availableCountStatus="idle"
        availableCount={null}
        tagLoadStatus="idle"
        availableTags={[]}
        sessionStartStatus="idle"
        sessionStartError={null}
        onDifficultyChange={() => undefined}
        onStatusChange={() => undefined}
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

  it('renders difficulty filter chips', () => {
    const html = renderToStaticMarkup(
      <PracticeSessionStarter
        sessionMode="tutor"
        sessionCount={20}
        filters={{ tagSlugs: [], difficulty: 'easy', status: 'unanswered' }}
        availableCountStatus="idle"
        availableCount={null}
        tagLoadStatus="idle"
        availableTags={[]}
        sessionStartStatus="idle"
        sessionStartError={null}
        onDifficultyChange={() => undefined}
        onStatusChange={() => undefined}
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

  it('navigateTo calls window.location.assign', () => {
    const assign = vi.fn();
    navigateTo('#practice-nav-test', { assign });

    expect(assign).toHaveBeenCalledWith('#practice-nav-test');
  });
});
