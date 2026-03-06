// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let Select: typeof import('./select').Select;
let SelectTrigger: typeof import('./select').SelectTrigger;
let SelectValue: typeof import('./select').SelectValue;

beforeAll(async () => {
  ({ Select, SelectTrigger, SelectValue } = await import('./select'));
});

function getClassTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

describe('components/ui/select', () => {
  it('uses stronger dark-mode boundary tokens on select trigger', () => {
    const html = renderToStaticMarkup(
      <Select>
        <SelectTrigger aria-label="Topic">
          <SelectValue placeholder="Choose topic" />
        </SelectTrigger>
      </Select>,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const trigger = doc.querySelector('[data-slot="select-trigger"]');
    const classTokens = getClassTokens(trigger?.getAttribute('class') ?? '');

    expect(trigger).not.toBeNull();
    expect(classTokens.has('dark:border-foreground/40')).toBe(true);
    expect(classTokens.has('dark:border-input')).toBe(false);
  });
});
