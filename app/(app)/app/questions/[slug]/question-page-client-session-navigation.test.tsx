// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { toQuestionRoute } from '@/lib/routes';
import {
  createBaseProps,
  fixtureSession123Id,
  getBottomActionBar,
  sharedSessionNavigation,
} from './question-page-client-test-helpers';

const fixtureQuestion2Id = crypto.randomUUID();

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

type QuestionPageClientModule = typeof import('./question-page-client');

let QuestionView: QuestionPageClientModule['QuestionView'];

beforeAll(async () => {
  ({ QuestionView } = await import('./question-page-client'));
});

describe('QuestionView', () => {
  const historySequenceNavigation = {
    questions: [
      { slug: 'q1', order: 1, isCorrect: null },
      { slug: 'q2', order: 2, isCorrect: null },
      { slug: 'q3', order: 3, isCorrect: null },
    ],
    currentIndex: 1,
    from: 'history',
    historySequence: ['q1', 'q2', 'q3'],
  } as const;

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
      a.textContent?.includes('Previous'),
    );

    expect(previousLink?.getAttribute('href')).toBe(
      toQuestionRoute('q1', {
        from: 'practice',
        mode: 'review',
        sessionId: fixtureSession123Id,
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
      a.textContent?.includes('Next'),
    );

    expect(nextLink?.getAttribute('href')).toBe(
      toQuestionRoute('q3', {
        from: 'practice',
        mode: 'review',
        sessionId: fixtureSession123Id,
      }),
    );
  });

  it('renders history-sequence navigation links without sessionId', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        origin="history"
        mode="review"
        sessionNavigation={historySequenceNavigation}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    const previousLink = Array.from(bottomBar.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Previous'),
    );
    const nextLink = Array.from(bottomBar.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Next'),
    );

    expect(previousLink?.getAttribute('href')).toContain(
      'historySeq=q1%2Cq2%2Cq3',
    );
    expect(previousLink?.getAttribute('href')).toContain('historyIndex=0');
    expect(previousLink?.getAttribute('href')).not.toContain('sessionId=');
    expect(nextLink?.getAttribute('href')).toContain('historyIndex=2');
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

  it('hides Previous on the first question of session review', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={{
          questions: [
            { slug: 'q1', order: 1, isCorrect: false },
            { slug: 'q2', order: 2, isCorrect: true },
          ],
          currentIndex: 0,
          sessionId: fixtureSession123Id,
          from: 'practice',
        }}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    const previousControl = Array.from(
      bottomBar.querySelectorAll('a,button'),
    ).find((element) => element.textContent?.includes('Previous'));
    const nextLink = Array.from(bottomBar.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Next'),
    );

    expect(previousControl).toBeUndefined();
    expect(nextLink?.getAttribute('href')).toBe(
      toQuestionRoute('q2', {
        from: 'practice',
        mode: 'review',
        sessionId: fixtureSession123Id,
      }),
    );
  });

  it('hides Next on the last question of session review', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={{
          questions: [
            { slug: 'q1', order: 1, isCorrect: false },
            { slug: 'q2', order: 2, isCorrect: true },
          ],
          currentIndex: 1,
          sessionId: fixtureSession123Id,
          from: 'practice',
        }}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    const previousLink = Array.from(bottomBar.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Previous'),
    );
    const nextControl = Array.from(bottomBar.querySelectorAll('a,button')).find(
      (element) => element.textContent?.includes('Next'),
    );

    expect(nextControl).toBeUndefined();
    expect(previousLink?.getAttribute('href')).toBe(
      toQuestionRoute('q1', {
        from: 'practice',
        mode: 'review',
        sessionId: fixtureSession123Id,
      }),
    );
  });

  it('shows Submit when route is session review and session navigation is unavailable', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        sessionId={fixtureSession123Id}
        sessionNavigation={null}
        submitResult={null}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    expect(bottomBar.textContent).toContain('Submit');
  });

  it('renders Back button in bottom bar for unanswered session questions', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        origin="history"
        sessionId={fixtureSession123Id}
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

  it('renders unanswered banner and inline Try Again for session review unanswered question', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        sessionId={fixtureSession123Id}
        reviewSessionMode="tutor"
        question={{
          questionId: fixtureQuestion2Id,
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
          sessionMode: 'tutor',
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
    expect(doc.querySelector('[data-testid="verdict-pill"]')).toBeNull();
    expect(html).toContain('Explanation for unanswered review');
    expect(bottomBar.textContent).not.toContain('Submit');
    expect(bottomBar.textContent).toContain('Try Again');
    expect(bottomBar.textContent).toContain('Previous');
    expect(bottomBar.textContent).toContain('Next');
    expect(bottomBar.textContent).toContain('Back to History');
  });

  it('suppresses Try Again for exam-session unanswered review questions', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        sessionId={fixtureSession123Id}
        reviewSessionMode="exam"
        question={{
          questionId: fixtureQuestion2Id,
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
          sessionMode: 'exam',
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
    expect(bottomBar.textContent).not.toContain('Try Again');
    expect(bottomBar.textContent).toContain('Previous');
    expect(bottomBar.textContent).toContain('Next');
  });

  it('does not render a your-answer section for session review unanswered hydration', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        sessionId={fixtureSession123Id}
        reviewSessionMode="tutor"
        question={{
          questionId: fixtureQuestion2Id,
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
          sessionMode: 'tutor',
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

    expect(doc.querySelector('[data-testid="verdict-pill"]')).toBeNull();
    expect(html).toContain('Explanation for unanswered review');
    expect(html).not.toContain('Your answer');
    expect(html).toContain(
      'You did not answer this question during this session.',
    );
    expect(bottomBar.textContent).toContain('Try Again');
  });

  it('renders explicit hydration error fallback with Answer as new action', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        reviewHydrationState="hydration_error"
      />,
    );

    expect(html).toContain('Could not load your previous answer.');
    expect(html).toContain('Retry load');
    expect(html).toContain('Answer as new');
    expect(html).not.toContain('data-testid="bottom-action-bar"');
  });

  it('does not render the session navigation bar when sessionNavigation is null', () => {
    const html = renderToStaticMarkup(
      <QuestionView {...createBaseProps()} sessionNavigation={null} />,
    );

    expect(html).not.toContain('>Previous<');
    expect(html).not.toContain('>Next<');
    expect(html).not.toContain('Question 1 of');

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const indicator = Array.from(doc.querySelectorAll('p')).find((p) =>
      p.textContent?.includes('Question 1 of'),
    );
    expect(indicator).toBeUndefined();
  });
});
