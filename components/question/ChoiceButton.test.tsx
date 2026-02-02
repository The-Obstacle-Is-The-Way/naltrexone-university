// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChoiceButton } from './ChoiceButton';

describe('ChoiceButton', () => {
  it('renders label and text', () => {
    const html = renderToStaticMarkup(
      <ChoiceButton
        label="A"
        textMd="Choice A"
        selected={false}
        onClick={() => {}}
      />,
    );

    expect(html).toContain('A');
    expect(html).toContain('Choice A');
  });
});
