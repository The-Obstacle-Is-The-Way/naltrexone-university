// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let ChoiceButton: typeof import('./choice-button').ChoiceButton;

beforeAll(async () => {
  ({ ChoiceButton } = await import('./choice-button'));
});

function getClassTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

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

    const wrapperClassTokens = getClassTokens(
      wrapperLabel.getAttribute('class') ?? '',
    );

    expect(wrapperClassTokens.has('cursor-not-allowed')).toBe(true);
    expect(wrapperClassTokens.has('opacity-50')).toBe(false);
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

    const wrapperClassTokens = getClassTokens(
      wrapperLabel.getAttribute('class') ?? '',
    );

    expect(wrapperClassTokens.has('opacity-50')).toBe(true);
    expect(wrapperClassTokens.has('cursor-not-allowed')).toBe(true);
  });

  it('uses the DEBT-280 dark-mode boundary tokens for unselected choices', () => {
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
    const wrapperClassTokens = getClassTokens(
      wrapperLabel?.getAttribute('class') ?? '',
    );
    const badgeClassTokens = getClassTokens(badge?.getAttribute('class') ?? '');

    expect(wrapperLabel).not.toBeNull();
    expect(badge).not.toBeNull();
    expect(wrapperClassTokens.has('border-border/60')).toBe(true);
    expect(wrapperClassTokens.has('bg-muted/20')).toBe(true);
    expect(wrapperClassTokens.has('dark:border-foreground/40')).toBe(true);
    expect(wrapperClassTokens.has('dark:bg-foreground/8')).toBe(false);
    expect(wrapperClassTokens.has('hover:bg-muted/40')).toBe(true);
    expect(wrapperClassTokens.has('dark:hover:border-foreground/55')).toBe(
      true,
    );
    expect(wrapperClassTokens.has('dark:hover:bg-foreground/8')).toBe(true);
    expect(wrapperClassTokens.has('dark:hover:border-foreground/70')).toBe(
      false,
    );
    expect(badgeClassTokens.has('bg-muted')).toBe(true);
    expect(badgeClassTokens.has('dark:border-foreground/60')).toBe(true);
    expect(badgeClassTokens.has('dark:bg-foreground/20')).toBe(true);
    expect(badgeClassTokens.has('bg-background')).toBe(false);
  });

  it('adds a distinct dark-mode hover fill for unselected choices', () => {
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
    const wrapperClassTokens = getClassTokens(
      wrapperLabel?.getAttribute('class') ?? '',
    );

    expect(wrapperLabel).not.toBeNull();
    expect(wrapperClassTokens.has('dark:hover:bg-foreground/8')).toBe(true);
    expect(wrapperClassTokens.has('dark:hover:border-foreground/55')).toBe(
      true,
    );
    expect(wrapperClassTokens.has('dark:hover:bg-foreground/15')).toBe(false);
    expect(wrapperClassTokens.has('dark:hover:border-foreground/70')).toBe(
      false,
    );
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
    const wrapperClassTokens = getClassTokens(
      wrapperLabel?.getAttribute('class') ?? '',
    );
    const choiceTextClassTokens = getClassTokens(
      choiceText?.parentElement?.getAttribute('class') ?? '',
    );

    expect(wrapperClassTokens.has('opacity-50')).toBe(false);
    expect(choiceTextClassTokens.has('text-foreground')).toBe(true);
    expect(choiceTextClassTokens.has('text-muted-foreground')).toBe(false);
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
    const classTokens = getClassTokens(
      wrapperLabel?.getAttribute('class') ?? '',
    );

    expect(classTokens.has('text-success')).toBe(true);
    expect(classTokens.has('text-success-foreground')).toBe(false);
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
    const wrapperClassTokens = getClassTokens(
      wrapperLabel?.getAttribute('class') ?? '',
    );

    expect(wrapperClassTokens.has('bg-muted/40')).toBe(true);
    expect(wrapperClassTokens.has('border-ring')).toBe(true);
    expect(wrapperClassTokens.has('dark:bg-foreground/15')).toBe(true);
    expect(wrapperClassTokens.has('dark:border-foreground/70')).toBe(true);
    expect(wrapperClassTokens.has('dark:bg-foreground/20')).toBe(false);
    expect(wrapperClassTokens.has('dark:hover:bg-foreground/8')).toBe(false);
    expect(wrapperClassTokens.has('dark:hover:border-foreground/55')).toBe(
      false,
    );
  });

  it('keeps the unselected dark-mode rest state flush with the card', () => {
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
    const wrapperClassTokens = getClassTokens(
      wrapperLabel?.getAttribute('class') ?? '',
    );

    expect(wrapperClassTokens.has('bg-muted/20')).toBe(true);
    expect(wrapperClassTokens.has('dark:border-foreground/40')).toBe(true);
    expect(wrapperClassTokens.has('dark:bg-foreground/8')).toBe(false);
    expect(wrapperClassTokens.has('bg-muted/40')).toBe(false);
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

    const wrapperClassTokens = getClassTokens(
      wrapperLabel?.getAttribute('class') ?? '',
    );

    expect(wrapperClassTokens.has('bg-success/10')).toBe(true);
    expect(wrapperClassTokens.has('bg-muted/40')).toBe(false);
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
    const correctLabelTokens = getClassTokens(
      correctLabel?.getAttribute('class') ?? '',
    );
    const correctBadgeTokens = getClassTokens(
      correctBadge?.getAttribute('class') ?? '',
    );

    const incorrectDoc = new DOMParser().parseFromString(
      incorrectHtml,
      'text/html',
    );
    const incorrectLabel = incorrectDoc.querySelector('label');
    const incorrectBadge = incorrectDoc.querySelector('.rounded-full');
    const incorrectLabelTokens = getClassTokens(
      incorrectLabel?.getAttribute('class') ?? '',
    );
    const incorrectBadgeTokens = getClassTokens(
      incorrectBadge?.getAttribute('class') ?? '',
    );

    // Correct verdict: semantic success colors must not be masked by dark overrides
    expect(correctLabelTokens.has('border-success')).toBe(true);
    expect(correctLabelTokens.has('dark:border-foreground/40')).toBe(false);
    expect(correctLabelTokens.has('dark:bg-foreground/8')).toBe(false);
    expect(correctLabelTokens.has('dark:bg-foreground/15')).toBe(false);
    expect(correctLabelTokens.has('dark:hover:bg-foreground/8')).toBe(false);
    expect(correctLabelTokens.has('dark:hover:border-foreground/55')).toBe(
      false,
    );
    expect(correctLabelTokens.has('dark:border-foreground/70')).toBe(false);
    expect(correctLabelTokens.has('dark:bg-foreground/20')).toBe(false);
    expect(correctBadgeTokens.has('border-success')).toBe(true);
    expect(correctBadgeTokens.has('dark:border-foreground/60')).toBe(false);
    expect(correctBadgeTokens.has('dark:bg-foreground/20')).toBe(false);

    // Incorrect verdict: semantic destructive colors must not be masked
    expect(incorrectLabelTokens.has('border-destructive')).toBe(true);
    expect(incorrectLabelTokens.has('dark:border-foreground/40')).toBe(false);
    expect(incorrectLabelTokens.has('dark:bg-foreground/8')).toBe(false);
    expect(incorrectLabelTokens.has('dark:bg-foreground/15')).toBe(false);
    expect(incorrectLabelTokens.has('dark:hover:bg-foreground/8')).toBe(false);
    expect(incorrectLabelTokens.has('dark:hover:border-foreground/55')).toBe(
      false,
    );
    expect(incorrectLabelTokens.has('dark:border-foreground/70')).toBe(false);
    expect(incorrectLabelTokens.has('dark:bg-foreground/20')).toBe(false);
    expect(incorrectBadgeTokens.has('border-destructive')).toBe(true);
    expect(incorrectBadgeTokens.has('dark:border-foreground/60')).toBe(false);
    expect(incorrectBadgeTokens.has('dark:bg-foreground/20')).toBe(false);
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
