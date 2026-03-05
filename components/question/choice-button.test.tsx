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

  it('uses stronger dark-mode boundary tokens for unselected choices', () => {
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
    const wrapperClass = wrapperLabel?.getAttribute('class') ?? '';

    expect(wrapperLabel).not.toBeNull();
    expect(badge).not.toBeNull();
    expect(wrapperClass).toContain('border-border/60');
    expect(wrapperClass).toContain('bg-muted/20');
    expect(wrapperClass).toContain('dark:border-foreground/40');
    expect(wrapperClass).toContain('dark:bg-foreground/40');
    expect(wrapperClass).toContain('hover:bg-muted/40');
    expect(wrapperClass).toContain('dark:hover:border-foreground/70');
    expect(badge?.getAttribute('class')).toContain('bg-muted');
    expect(badge?.getAttribute('class')).not.toContain('bg-background');
  });

  it('keeps wrong-unselected labels readable without parent opacity dimming', () => {
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
    const choiceText = Array.from(doc.querySelectorAll('p')).find(
      (paragraph) => paragraph.textContent?.trim() === 'Choice A',
    );

    expect(wrapperLabel).not.toBeNull();
    expect(choiceText).not.toBeUndefined();
    expect(wrapperLabel?.getAttribute('class')).not.toContain('opacity-50');
    expect(choiceText?.parentElement?.getAttribute('class')).toContain(
      'text-foreground',
    );
    expect(choiceText?.parentElement?.getAttribute('class')).not.toContain(
      'text-muted-foreground',
    );
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
    const wrapperClassTokens = (wrapperLabel?.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter(Boolean);

    expect(wrapperClassTokens).toContain('bg-muted/40');
    expect(wrapperClassTokens).toContain('border-ring');
    expect(wrapperClassTokens).toContain('dark:bg-foreground/40');
    expect(wrapperClassTokens).toContain('dark:border-foreground/70');
  });

  it('applies base background tint when unselected', () => {
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
    const wrapperClassTokens = (wrapperLabel?.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter(Boolean);

    expect(wrapperClassTokens).toContain('bg-muted/20');
    expect(wrapperClassTokens).toContain('dark:bg-foreground/40');
    expect(wrapperClassTokens).toContain('dark:border-foreground/40');
    expect(wrapperClassTokens).not.toContain('bg-muted/40');
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

    expect(wrapperLabel?.getAttribute('class')).toContain('bg-success/10');
    expect(wrapperLabel?.getAttribute('class')).not.toContain('bg-muted/40');
  });

  it('excludes dark border/bg overrides when verdict is set (prevents cascade masking)', () => {
    const correctHtml = renderToStaticMarkup(
      <ChoiceButton
        name="choices"
        label="A"
        textMd="Correct"
        selected
        disabled
        correctness="correct"
        onClick={() => {}}
      />,
    );

    const incorrectHtml = renderToStaticMarkup(
      <ChoiceButton
        name="choices"
        label="B"
        textMd="Incorrect"
        selected
        disabled
        correctness="incorrect"
        onClick={() => {}}
      />,
    );

    const correctDoc = new DOMParser().parseFromString(
      correctHtml,
      'text/html',
    );
    const correctLabel = correctDoc.querySelector('label');
    const correctBadge = correctDoc.querySelector('.rounded-full');
    const correctLabelClass = correctLabel?.getAttribute('class') ?? '';
    const correctBadgeClass = correctBadge?.getAttribute('class') ?? '';

    const incorrectDoc = new DOMParser().parseFromString(
      incorrectHtml,
      'text/html',
    );
    const incorrectLabel = incorrectDoc.querySelector('label');
    const incorrectBadge = incorrectDoc.querySelector('.rounded-full');
    const incorrectLabelClass = incorrectLabel?.getAttribute('class') ?? '';
    const incorrectBadgeClass = incorrectBadge?.getAttribute('class') ?? '';

    // Correct verdict: semantic success colors must not be masked by dark overrides
    expect(correctLabelClass).toContain('border-success');
    expect(correctLabelClass).not.toContain('dark:border-foreground/40');
    expect(correctLabelClass).not.toContain('dark:bg-foreground/40');
    expect(correctBadgeClass).toContain('border-success');
    expect(correctBadgeClass).not.toContain('dark:border-foreground/60');
    expect(correctBadgeClass).not.toContain('dark:bg-foreground/20');

    // Incorrect verdict: semantic destructive colors must not be masked
    expect(incorrectLabelClass).toContain('border-destructive');
    expect(incorrectLabelClass).not.toContain('dark:border-foreground/40');
    expect(incorrectLabelClass).not.toContain('dark:bg-foreground/40');
    expect(incorrectBadgeClass).toContain('border-destructive');
    expect(incorrectBadgeClass).not.toContain('dark:border-foreground/60');
    expect(incorrectBadgeClass).not.toContain('dark:bg-foreground/20');
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
