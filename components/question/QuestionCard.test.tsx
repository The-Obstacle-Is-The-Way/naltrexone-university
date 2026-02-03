// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QuestionCard } from './QuestionCard';

describe('QuestionCard', () => {
  it('renders stem and choices', () => {
    const html = renderToStaticMarkup(
      <QuestionCard
        stemMd="# Stem"
        choices={[
          { id: 'c1', label: 'A', textMd: 'Choice A' },
          { id: 'c2', label: 'B', textMd: 'Choice B' },
        ]}
        selectedChoiceId={null}
        correctChoiceId={null}
        onSelectChoice={() => {}}
      />,
    );

    expect(html).toContain('Stem');
    expect(html).toContain('Choice A');
    expect(html).toContain('Choice B');
    expect(html).toContain('<fieldset');
    expect(html).toContain('Answer choices');
  });
});
