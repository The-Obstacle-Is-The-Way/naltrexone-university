// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('QuestionView', () => {
  it('renders a Back to Dashboard utility link', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={null}
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

  it('renders an origin-aware back link when origin=review', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={null}
        canSubmit={false}
        isPending={false}
        origin="review"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = doc.querySelector('a[href="/app/history?tab=missed"]');

    expect(backLink?.textContent?.trim()).toBe('Back to History');
    expect(html).toContain('Reattempt a question from your review list.');
  });

  it('renders an origin-aware back link when origin=history', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={null}
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
    const backLink = doc.querySelector('a[href="/app/history"]');

    expect(backLink?.textContent?.trim()).toBe('Back to History');
    expect(html).toContain('Reviewing a question from your history.');
  });

  it('renders an origin-aware back link when origin=bookmarks', async () => {
    const { QuestionView } = await import('./question-page-client');

    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={null}
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
});
