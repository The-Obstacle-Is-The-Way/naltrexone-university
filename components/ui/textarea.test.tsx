// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let Textarea: typeof import('./textarea').Textarea;

beforeAll(async () => {
  ({ Textarea } = await import('./textarea'));
});

function getClassTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

describe('components/ui/textarea', () => {
  it('renders a textarea with the shared form-control tokens', () => {
    const html = renderToStaticMarkup(
      <Textarea
        name="comment"
        placeholder="Add details"
        maxLength={2000}
        aria-invalid="true"
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const textarea = doc.querySelector('[data-slot="textarea"]');
    const classTokens = getClassTokens(textarea?.getAttribute('class') ?? '');

    expect(textarea).not.toBeNull();
    expect(textarea?.getAttribute('name')).toBe('comment');
    expect(textarea?.getAttribute('placeholder')).toBe('Add details');
    expect(textarea?.getAttribute('maxLength')).toBe('2000');
    expect(textarea?.getAttribute('aria-invalid')).toBe('true');
    expect(classTokens.has('border-input')).toBe(true);
    expect(classTokens.has('dark:border-foreground/40')).toBe(true);
    expect(classTokens.has('focus-visible:ring-ring/50')).toBe(true);
    expect(classTokens.has('focus-visible:ring-[3px]')).toBe(true);
    expect(classTokens.has('aria-invalid:border-destructive')).toBe(true);
    expect(classTokens.has('disabled:opacity-50')).toBe(true);
  });
});
