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
});
