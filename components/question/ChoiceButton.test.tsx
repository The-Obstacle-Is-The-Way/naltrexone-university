// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChoiceButton } from './ChoiceButton';

describe('ChoiceButton', () => {
  it('renders label and text', () => {
    const html = renderToStaticMarkup(
      <ChoiceButton
        name="choices"
        label="A"
        textMd="Choice A"
        selected={false}
        onClick={() => {}}
      />,
    );

    expect(html).toContain('A');
    expect(html).toContain('Choice A');
    expect(html).toContain('type="radio"');
    expect(html).toContain('name="choices"');
    expect(html).toContain('aria-label="Choice A"');
    expect(html).not.toContain('checked=""');
  });

  it('exposes selected state via checked input', () => {
    const html = renderToStaticMarkup(
      <ChoiceButton
        name="choices"
        label="A"
        textMd="Choice A"
        selected
        onClick={() => {}}
      />,
    );

    expect(html).toContain('checked=""');
  });

  it('disables the choice input when disabled', () => {
    const html = renderToStaticMarkup(
      <ChoiceButton
        name="choices"
        label="A"
        textMd="Choice A"
        selected={false}
        disabled
        onClick={() => {}}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const input = doc.querySelector('input[type="radio"]');

    expect(input?.hasAttribute('disabled')).toBe(true);
  });
});
