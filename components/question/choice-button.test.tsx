// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let ChoiceButton: typeof import('./choice-button').ChoiceButton;

beforeAll(async () => {
  ({ ChoiceButton } = await import('./choice-button'));
});

function renderChoiceButton(
  overrides: Partial<React.ComponentProps<typeof ChoiceButton>> = {},
) {
  const html = renderToStaticMarkup(
    <ChoiceButton
      name="answer"
      label="B"
      textMd="Choice text"
      selected={false}
      onClick={() => undefined}
      {...overrides}
    />,
  );
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const label = doc.querySelector('label');
  const input = doc.querySelector('input[type="radio"]');

  return { html, label, input };
}

describe('ChoiceButton', () => {
  it('uses text-success (not text-success-foreground) for correct state', () => {
    const { label } = renderChoiceButton({ correctness: 'correct' });
    const className = label?.getAttribute('class') ?? '';

    expect(className).toContain('text-success');
    expect(className).not.toContain('text-success-foreground');
  });

  it('uses opacity-50 (not opacity-60) for wrong-unselected state', () => {
    const { label } = renderChoiceButton({
      disabled: true,
      correctness: 'wrong-unselected',
    });
    const className = label?.getAttribute('class') ?? '';

    expect(className).toContain('opacity-50');
    expect(className).not.toContain('opacity-60');
  });

  it('uses hover:bg-muted/60 (not hover:bg-muted/80) for interactive hover', () => {
    const { label } = renderChoiceButton({ disabled: false });
    const className = label?.getAttribute('class') ?? '';

    expect(className).toContain('hover:bg-muted/60');
    expect(className).not.toContain('hover:bg-muted/80');
  });

  it('sets radio input value equal to label', () => {
    const { input } = renderChoiceButton({ label: 'D' });

    expect(input?.getAttribute('value')).toBe('D');
  });
});
