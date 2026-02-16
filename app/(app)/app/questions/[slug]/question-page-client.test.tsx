// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { toQuestionRoute } from '@/lib/routes';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('QuestionView', () => {
  function createBaseProps() {
    return {
      loadState: { status: 'ready' as const },
      question: null,
      selectedChoiceId: null,
      submitResult: null,
      sessionNavigation: null,
      canSubmit: false,
      isPending: false,
      onTryAgain: () => undefined,
      onSelectChoice: () => undefined,
      onSubmit: () => undefined,
      onReattempt: () => undefined,
    };
  }

  const sharedSessionNavigation = {
    questions: [
      { slug: 'q1', order: 1, isCorrect: false },
      { slug: 'q2', order: 2, isCorrect: true },
      { slug: 'q3', order: 3, isCorrect: null },
    ],
    currentIndex: 1,
    sessionId: 'session_123',
    from: 'practice',
  } as const;

  it('renders a Back to Dashboard utility link', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={null}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = doc.querySelector('a[href="/app/dashboard"]');

    expect(backLink?.textContent?.trim()).toBe('Back to Dashboard');
  });

  it('renders an origin-aware back link when origin=history', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={null}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        origin="history"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = doc.querySelector('a[href="/app/history?tab=questions"]');

    expect(backLink?.textContent?.trim()).toBe('Back to History');
    expect(html).toContain('Reviewing a question from your history.');
  });

  it('prefers historyHref when origin=history and historyHref is present', async () => {
    const { QuestionView } = await import('./question-page-client');

    const historyHref = '/app/history?tab=questions&offset=20&limit=20';

    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        origin="history"
        historyHref={historyHref}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = Array.from(doc.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Back to History'),
    );

    expect(backLink?.getAttribute('href')).toBe(historyHref);
  });

  it('ignores invalid historyHref values when origin=history', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        origin="history"
        historyHref="https://example.com/phish"
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = Array.from(doc.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Back to History'),
    );

    expect(backLink?.getAttribute('href')).toBe('/app/history?tab=questions');
  });

  it('uses a session-aware back link when origin=practice and sessionId is present', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        origin="practice"
        sessionId="session_123"
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = doc.querySelector('a[href="/app/practice/session_123"]');

    expect(backLink?.textContent?.trim()).toBe('Back to Session');
  });

  it('uses a sessions-tab back link when origin=history and sessionId is present', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        origin="history"
        sessionId="session_123"
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = doc.querySelector('a[href="/app/history?tab=sessions"]');

    expect(backLink?.textContent?.trim()).toBe('Back to History');
  });

  it('renders an origin-aware back link when origin=bookmarks', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={null}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        origin="bookmarks"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = doc.querySelector('a[href="/app/bookmarks"]');

    expect(backLink?.textContent?.trim()).toBe('Back to Bookmarks');
    expect(html).toContain('Reattempt a question from your bookmarks.');
  });

  it('uses origin-aware post-submit back actions', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={{
          attemptId: 'attempt_1',
          isCorrect: false,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          choiceExplanations: [],
        }}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        origin="practice"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(
      doc.querySelector('a[href="/app/practice"]')?.textContent?.trim(),
    ).toBe('Back to Practice');
    expect(html).toContain('Review a question from your practice history.');
  });

  it('renders Feedback when submitResult is pre-populated (review mode)', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={{
          attemptId: 'attempt_1',
          isCorrect: true,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          choiceExplanations: [],
        }}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        origin="history"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).toContain('Correct');
    expect(html).toContain('Explanation');
  });

  it('renders "Try Again" instead of "Submit" when submitResult exists', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={{
          attemptId: 'attempt_1',
          isCorrect: false,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          choiceExplanations: [],
        }}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).toContain('Try Again');
    expect(html).not.toContain('>Submit<');
  });

  it('renders a previous link when sessionNavigation is not on the first question', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={sharedSessionNavigation}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const previousLink = Array.from(doc.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('← Previous'),
    );

    expect(previousLink?.getAttribute('href')).toBe(
      toQuestionRoute('q1', {
        from: 'practice',
        mode: 'review',
        sessionId: 'session_123',
      }),
    );
  });

  it('renders a next link when sessionNavigation is not on the last question', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={sharedSessionNavigation}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const nextLink = Array.from(doc.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Next →'),
    );

    expect(nextLink?.getAttribute('href')).toBe(
      toQuestionRoute('q3', {
        from: 'practice',
        mode: 'review',
        sessionId: 'session_123',
      }),
    );
  });

  it('renders the position indicator when sessionNavigation is present', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={sharedSessionNavigation}
      />,
    );

    expect(html).toContain('Question 2 of 3');
  });

  it('renders ReviewQuestionNavigator when sessionNavigation is present', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={sharedSessionNavigation}
      />,
    );

    expect(html).toContain('Question navigator');
  });

  it('does not render ReviewQuestionNavigator when sessionNavigation is null', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView {...createBaseProps()} sessionNavigation={null} />,
    );

    expect(html).not.toContain('Question navigator');
  });

  it('renders navigator buttons with correct/incorrect/unanswered variants', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={sharedSessionNavigation}
      />,
    );

    expect(html).toContain('bg-success');
    expect(html).toContain('bg-destructive');
    expect(html).toContain('bg-background');
  });

  it('does not render a previous link on the first question', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={{
          questions: [
            { slug: 'q1', order: 1, isCorrect: false },
            { slug: 'q2', order: 2, isCorrect: true },
          ],
          currentIndex: 0,
          sessionId: 'session_123',
          from: 'practice',
        }}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const previousLink = Array.from(doc.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('← Previous'),
    );

    expect(previousLink).toBeUndefined();
  });

  it('does not render a next link on the last question', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={{
          questions: [
            { slug: 'q1', order: 1, isCorrect: false },
            { slug: 'q2', order: 2, isCorrect: true },
          ],
          currentIndex: 1,
          sessionId: 'session_123',
          from: 'practice',
        }}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const nextLink = Array.from(doc.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Next →'),
    );

    expect(nextLink).toBeUndefined();
  });

  it('does not render the session navigation bar when sessionNavigation is null', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView {...createBaseProps()} sessionNavigation={null} />,
    );

    expect(html).not.toContain('← Previous');
    expect(html).not.toContain('Next →');
    expect(html).not.toContain('Question 1 of');
  });
});
