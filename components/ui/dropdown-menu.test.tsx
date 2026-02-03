// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('components/ui/dropdown-menu', () => {
  it('exports components and renders a trigger', async () => {
    const {
      DropdownMenu,
      DropdownMenuTrigger,
      DropdownMenuContent,
      DropdownMenuItem,
    } = await import('./dropdown-menu');

    const html = renderToStaticMarkup(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button">Open</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Item</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(html).toContain('data-slot="dropdown-menu-trigger"');
    expect(html).toContain('Open');
    // Closed by default; menu content should not be present in static markup.
    expect(html).not.toContain('Item');
  });
});
