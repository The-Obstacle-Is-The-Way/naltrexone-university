// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('components/ui/avatar', () => {
  it('renders avatar slots', async () => {
    const { Avatar, AvatarFallback } = await import('./avatar');

    const html = renderToStaticMarkup(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );

    expect(html).toContain('data-slot="avatar"');
    expect(html).toContain('data-slot="avatar-fallback"');
    expect(html).toContain('AB');
  });
});
