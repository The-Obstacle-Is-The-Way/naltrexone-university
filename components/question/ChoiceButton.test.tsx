// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChoiceButton } from './choice-button';

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
    expect(html).not.toContain('checked=""');

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const input = doc.querySelector('input[type="radio"]');
    const wrapperLabel = input?.closest('label');

    expect(input).not.toBeNull();
    expect(wrapperLabel).not.toBeNull();
    if (!input || !wrapperLabel) {
      throw new Error('Expected radio input and wrapper label to exist.');
    }
    expect(input.getAttribute('aria-label')).toBeNull();
    expect(wrapperLabel.textContent).toContain('Choice A');
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

    expect(input).not.toBeNull();
    if (!input) {
      throw new Error('Expected radio input to exist.');
    }
    expect(input.hasAttribute('disabled')).toBe(true);
  });

  it('does not apply opacity-50 when disabled with correctness', () => {
    const html = renderToStaticMarkup(
      <ChoiceButton
        name="choices"
        label="A"
        textMd="Choice A"
        selected
        disabled
        correctness="correct"
        onClick={() => {}}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const input = doc.querySelector('input[type="radio"]');
    const wrapperLabel = input?.closest('label');

    expect(wrapperLabel).not.toBeNull();
    if (!wrapperLabel) {
      throw new Error('Expected wrapper label to exist.');
    }

    expect(wrapperLabel.getAttribute('class')).toContain('cursor-not-allowed');
    expect(wrapperLabel.getAttribute('class')).not.toContain('opacity-50');
  });

  it('applies opacity-50 when disabled without correctness', () => {
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
    const wrapperLabel = input?.closest('label');

    expect(wrapperLabel).not.toBeNull();
    if (!wrapperLabel) {
      throw new Error('Expected wrapper label to exist.');
    }

    expect(wrapperLabel.getAttribute('class')).toContain('opacity-50');
    expect(wrapperLabel.getAttribute('class')).toContain('cursor-not-allowed');
  });
});
