// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('app/(app)/app/questions/[slug]', () => {
  it('renders a question shell', async () => {
    const QuestionPage = (await import('./page')).default;

    const html = renderToStaticMarkup(
      <QuestionPage params={{ slug: 'q-1' }} />,
    );

    expect(html).toContain('Question');
    expect(html).toContain('Loading question');
    expect(html).toContain('Back to Dashboard');
    expect(html).toContain('Submit');
  });
});
