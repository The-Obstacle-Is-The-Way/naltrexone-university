// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('components/ui/card', () => {
  it('renders a card with expected slot attribute', async () => {
    const { Card } = await import('./card');

    const html = renderToStaticMarkup(
      <Card className="custom-class">
        <div>Content</div>
      </Card>,
    );

    expect(html).toContain('data-slot="card"');
    expect(html).toContain('custom-class');
    expect(html).toContain('Content');
  });
});
