// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let Select: typeof import('./select').Select;
let SelectTrigger: typeof import('./select').SelectTrigger;
let SelectValue: typeof import('./select').SelectValue;

beforeAll(async () => {
  ({ Select, SelectTrigger, SelectValue } = await import('./select'));
});

describe('components/ui/select', () => {
  it('uses stronger dark-mode boundary tokens on select trigger', () => {
    const html = renderToStaticMarkup(
      <Select>
        <SelectTrigger aria-label="Topic">
          <SelectValue placeholder="Choose topic" />
        </SelectTrigger>
      </Select>,
    );

    expect(html).toContain('data-slot="select-trigger"');
    expect(html).toContain('dark:border-foreground/40');
    expect(html).not.toContain('dark:border-input');
  });
});
