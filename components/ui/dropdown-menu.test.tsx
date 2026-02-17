// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

type DropdownModule = typeof import('@/components/ui/dropdown-menu');

let DropdownMenu: DropdownModule['DropdownMenu'];
let DropdownMenuTrigger: DropdownModule['DropdownMenuTrigger'];
let DropdownMenuContent: DropdownModule['DropdownMenuContent'];
let DropdownMenuItem: DropdownModule['DropdownMenuItem'];

beforeAll(async () => {
  const module = await import('@/components/ui/dropdown-menu');
  DropdownMenu = module.DropdownMenu;
  DropdownMenuTrigger = module.DropdownMenuTrigger;
  DropdownMenuContent = module.DropdownMenuContent;
  DropdownMenuItem = module.DropdownMenuItem;
});

describe('components/ui/dropdown-menu', () => {
  it('exports components and renders a trigger', () => {
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
