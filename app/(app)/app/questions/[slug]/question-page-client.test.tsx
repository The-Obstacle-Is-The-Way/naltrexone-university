// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { toQuestionRoute } from '@/lib/routes';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

type QuestionPageClientModule = typeof import('./question-page-client');

let QuestionView: QuestionPageClientModule['QuestionView'];

beforeAll(async () => {
  ({ QuestionView } = await import('./question-page-client'));
});

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

  function getBottomActionBar(doc: Document): HTMLDivElement | null {
    return doc.querySelector<HTMLDivElement>(
      '[data-testid="bottom-action-bar"]',
    );
  }

  // Uses shadcn's data-slot="button" to capture both <button> and asChild <a> elements.
  // If shadcn removes data-slot, fall back to 'button, a' combined selector.
  function getBottomActionLabels(doc: Document): string[] {
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) {
      throw new Error('Expected bottom action bar');
    }

    return Array.from(bottomBar.querySelectorAll('[data-slot="button"]')).map(
      (element) => (element.textContent ?? '').trim(),
    );
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

  it('renders a Back to Dashboard utility link', () => {
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

  it('renders an origin-aware back link when origin=history', () => {
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

  it('prefers historyHref when origin=history and historyHref is present', () => {
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

  it('ignores invalid historyHref values when origin=history', () => {
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

  it('uses a session-aware back link when origin=practice and sessionId is present', () => {
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

  it('uses a sessions-tab back link when origin=history and sessionId is present', () => {
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

  it('renders an origin-aware back link when origin=bookmarks', () => {
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

  it('uses origin-aware post-submit back actions', () => {
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
          referenceMd: null,
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

  it('renders Feedback when submitResult is pre-populated (review mode)', () => {
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
          referenceMd: null,
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

  it('keeps Try Again in history individual review', () => {
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
          referenceMd: null,
          choiceExplanations: [],
        }}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        mode="review"
        origin="history"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).toContain('Try Again');
    expect(html).not.toContain('>Submit<');
  });

  it('renders a previous link when sessionNavigation is not on the first question', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={sharedSessionNavigation}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    const previousLink = Array.from(bottomBar.querySelectorAll('a')).find((a) =>
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

  it('renders a next link when sessionNavigation is not on the last question', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={sharedSessionNavigation}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    const nextLink = Array.from(bottomBar.querySelectorAll('a')).find((a) =>
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

  it('hides Try Again in answered session review', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        sessionId="session_123"
        sessionNavigation={sharedSessionNavigation}
        submitResult={{
          attemptId: 'attempt_1',
          isCorrect: false,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(getBottomActionLabels(doc)).toEqual([
      '← Previous',
      'Next →',
      'Back to History',
    ]);
  });

  it('renders the position indicator when sessionNavigation is present', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={sharedSessionNavigation}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const indicator = Array.from(doc.querySelectorAll('p')).find((p) =>
      p.textContent?.includes('Question 2 of 3'),
    );
    expect(indicator).not.toBeNull();
    expect(indicator?.classList.contains('text-center')).toBe(true);

    // Regression guard: the old inline indicator was removed in SPEC-030.
    // Class-based selector is intentional here — we're asserting a removed
    // element is absent, so there's no production element to tag with data-testid.
    const inlineIndicator = Array.from(
      doc.querySelectorAll('span.text-sm.text-muted-foreground'),
    ).find((span) => span.textContent?.includes('Question 2 of 3'));
    expect(inlineIndicator).toBeUndefined();
  });

  it('renders ReviewQuestionNavigator when sessionNavigation is present', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={sharedSessionNavigation}
      />,
    );

    expect(html).toContain('Question navigator');
  });

  it('does not render ReviewQuestionNavigator when sessionNavigation is null', () => {
    const html = renderToStaticMarkup(
      <QuestionView {...createBaseProps()} sessionNavigation={null} />,
    );

    expect(html).not.toContain('Question navigator');
  });

  it('renders navigator buttons with correct/incorrect/unanswered variants', () => {
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

  it('shows disabled Previous on the first question of session review', () => {
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
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    const previousButton = Array.from(
      bottomBar.querySelectorAll('button'),
    ).find((button) => button.textContent?.includes('← Previous'));
    const nextLink = Array.from(bottomBar.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Next →'),
    );

    expect(previousButton).not.toBeUndefined();
    expect(previousButton?.hasAttribute('disabled')).toBe(true);
    expect(previousButton?.getAttribute('type')).toBe('button');
    expect(nextLink?.getAttribute('href')).toBe(
      toQuestionRoute('q2', {
        from: 'practice',
        mode: 'review',
        sessionId: 'session_123',
      }),
    );
  });

  it('shows disabled Next on the last question of session review', () => {
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
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    const previousLink = Array.from(bottomBar.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('← Previous'),
    );
    const nextButton = Array.from(bottomBar.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Next →'),
    );

    expect(nextButton).not.toBeUndefined();
    expect(nextButton?.hasAttribute('disabled')).toBe(true);
    expect(nextButton?.getAttribute('type')).toBe('button');
    expect(previousLink?.getAttribute('href')).toBe(
      toQuestionRoute('q1', {
        from: 'practice',
        mode: 'review',
        sessionId: 'session_123',
      }),
    );
  });

  it('hides Submit when route is session review and session navigation is unavailable', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        sessionId="session_123"
        sessionNavigation={null}
        submitResult={null}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    expect(bottomBar.textContent).not.toContain('Submit');
  });

  it('renders Back button in bottom bar for unanswered session questions', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        origin="history"
        sessionId="session_123"
        sessionNavigation={sharedSessionNavigation}
        submitResult={null}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    const backLink = Array.from(bottomBar.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Back to History'),
    );
    expect(backLink?.getAttribute('href')).toBe('/app/history?tab=sessions');
  });

  it('renders unanswered banner and read-only reveal for session review unanswered question', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        sessionId="session_123"
        question={{
          questionId: 'q2',
          slug: 'q2',
          stemMd: 'Question stem',
          difficulty: 'easy',
          choices: [
            { id: 'c1', label: 'A', textMd: 'Choice A' },
            { id: 'c2', label: 'B', textMd: 'Choice B' },
          ],
        }}
        sessionNavigation={sharedSessionNavigation}
        submitResult={null}
        sessionUnansweredReveal={{
          correctChoiceId: 'c2',
          explanationMd: 'Explanation for unanswered review',
          referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
          choiceExplanations: [],
        }}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    expect(html).toContain(
      'You did not answer this question during this session.',
    );
    expect(html).toContain('Incorrect');
    expect(html).toContain('Explanation for unanswered review');
    expect(bottomBar.textContent).not.toContain('Submit');
    expect(bottomBar.textContent).not.toContain('Try Again');
    expect(bottomBar.textContent).toContain('← Previous');
    expect(bottomBar.textContent).toContain('Next →');
    expect(bottomBar.textContent).toContain('Back to History');
  });

  it('does not render the session navigation bar when sessionNavigation is null', () => {
    const html = renderToStaticMarkup(
      <QuestionView {...createBaseProps()} sessionNavigation={null} />,
    );

    expect(html).not.toContain('← Previous');
    expect(html).not.toContain('Next →');
    expect(html).not.toContain('Question 1 of');

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const indicator = Array.from(doc.querySelectorAll('p')).find((p) =>
      p.textContent?.includes('Question 1 of'),
    );
    expect(indicator).toBeUndefined();
  });
});
