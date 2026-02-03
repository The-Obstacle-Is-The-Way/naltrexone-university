// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('components/ui/radio-group', () => {
  it('renders radio group slots', async () => {
    const { RadioGroup, RadioGroupItem } = await import('./radio-group');

    const html = renderToStaticMarkup(
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" />
      </RadioGroup>,
    );

    expect(html).toContain('data-slot="radio-group"');
    expect(html).toContain('data-slot="radio-group-item"');
    expect(html).toContain('data-slot="radio-group-indicator"');
  });
});
