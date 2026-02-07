// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('PracticeView', () => {
  it('applies transition-colors to the Back to Dashboard utility link', async () => {
    const { PracticeView } = await import('./practice-view');

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

    expect(html).toContain(
      'text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
    );
  });
});
