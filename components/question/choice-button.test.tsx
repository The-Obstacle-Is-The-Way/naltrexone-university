// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let ChoiceButton: typeof import('./choice-button').ChoiceButton;

beforeAll(async () => {
  ({ ChoiceButton } = await import('./choice-button'));
});

describe('ChoiceButton', () => {
  it('renders label and text with base body typography', () => {
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
    const choiceParagraph = Array.from(doc.querySelectorAll('p')).find(
      (paragraph) => paragraph.textContent?.trim() === 'Choice A',
    );

    expect(input).not.toBeNull();
    expect(wrapperLabel).not.toBeNull();
    expect(choiceParagraph).not.toBeUndefined();
    if (!input || !wrapperLabel) {
      throw new Error('Expected radio input and wrapper label to exist.');
    }
    expect(input.getAttribute('aria-label')).toBeNull();
    expect(wrapperLabel.textContent).toContain('Choice A');
    expect(choiceParagraph?.parentElement?.className).toContain('text-base');
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

  it('uses muted hover contrast and muted badge background', () => {
    const html = renderToStaticMarkup(
      <ChoiceButton
        name="choices"
        label="A"
        textMd="Choice A"
        selected={false}
        onClick={() => {}}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const input = doc.querySelector('input[type="radio"]');
    const wrapperLabel = input?.closest('label');
    const badge = wrapperLabel?.querySelector('div.h-7.w-7');

    expect(wrapperLabel).not.toBeNull();
    expect(badge).not.toBeNull();
    expect(wrapperLabel?.getAttribute('class')).toContain('hover:bg-muted/60');
    expect(wrapperLabel?.getAttribute('class')).not.toContain(
      'hover:bg-muted/80',
    );
    expect(wrapperLabel?.getAttribute('class')).toContain(
      'hover:border-muted-foreground/30',
    );
    expect(badge?.getAttribute('class')).toContain('bg-muted');
    expect(badge?.getAttribute('class')).not.toContain('bg-background');
  });

  it('applies opacity-50 for wrong-unselected correctness', () => {
    const html = renderToStaticMarkup(
      <ChoiceButton
        name="choices"
        label="A"
        textMd="Choice A"
        selected={false}
        disabled
        correctness="wrong-unselected"
        onClick={() => {}}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const input = doc.querySelector('input[type="radio"]');
    const wrapperLabel = input?.closest('label');

    expect(wrapperLabel).not.toBeNull();
    expect(wrapperLabel?.getAttribute('class')).toContain('opacity-50');
    expect(wrapperLabel?.getAttribute('class')).not.toContain('opacity-60');
  });

  it('uses text-success (not text-success-foreground) for correct state', () => {
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
    const className = wrapperLabel?.getAttribute('class') ?? '';

    expect(className).toContain('text-success');
    expect(className).not.toContain('text-success-foreground');
  });

  it('applies background tint when selected pre-submission', () => {
    const html = renderToStaticMarkup(
      <ChoiceButton
        name="choices"
        label="B"
        textMd="Choice B"
        selected
        onClick={() => {}}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrapperLabel = doc.querySelector('label');

    expect(wrapperLabel?.getAttribute('class')).toContain('bg-muted/20');
    expect(wrapperLabel?.getAttribute('class')).toContain('border-ring');
  });

  it('does not apply background tint when unselected', () => {
    const html = renderToStaticMarkup(
      <ChoiceButton
        name="choices"
        label="A"
        textMd="Choice A"
        selected={false}
        onClick={() => {}}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrapperLabel = doc.querySelector('label');

    expect(wrapperLabel?.getAttribute('class')).not.toContain('bg-muted/20');
  });

  it('does not apply selected tint when correctness is set', () => {
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
    const wrapperLabel = doc.querySelector('label');

    expect(wrapperLabel?.getAttribute('class')).not.toContain('bg-muted/20');
    expect(wrapperLabel?.getAttribute('class')).toContain('bg-success/10');
  });

  it('sets radio input value equal to label', () => {
    const html = renderToStaticMarkup(
      <ChoiceButton
        name="choices"
        label="D"
        textMd="Choice D"
        selected={false}
        onClick={() => {}}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const input = doc.querySelector('input[type="radio"]');

    expect(input?.getAttribute('value')).toBe('D');
  });
});
