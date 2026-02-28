// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let QuestionCard: typeof import('./question-card').QuestionCard;

beforeAll(async () => {
  ({ QuestionCard } = await import('./question-card'));
});

describe('QuestionCard', () => {
  it('renders stem and choices with base body text and larger stem-to-choice gap', () => {
    const html = renderToStaticMarkup(
      <QuestionCard
        stemMd="Stem paragraph"
        choices={[
          { id: 'c1', label: 'A', textMd: 'Choice A' },
          { id: 'c2', label: 'B', textMd: 'Choice B' },
        ]}
        selectedChoiceId={null}
        correctChoiceId={null}
        onSelectChoice={() => {}}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const stemParagraph = Array.from(doc.querySelectorAll('p')).find(
      (paragraph) => paragraph.textContent?.trim() === 'Stem paragraph',
    );
    const fieldset = doc.querySelector('fieldset');

    expect(stemParagraph).not.toBeUndefined();
    expect(fieldset).not.toBeNull();
    expect(stemParagraph?.parentElement?.className).toContain('text-base');
    expect(fieldset?.className).toContain('mt-8');
    expect(html).toContain('Choice A');
    expect(html).toContain('Choice B');
    expect(html).toContain('<fieldset');
    expect(html).toContain('Answer choices');
  });

  it('marks unselected wrong answers as wrong-unselected in post-submit state', () => {
    const html = renderToStaticMarkup(
      <QuestionCard
        stemMd="Stem paragraph"
        choices={[
          { id: 'c1', label: 'A', textMd: 'Choice A' },
          { id: 'c2', label: 'B', textMd: 'Choice B' },
          { id: 'c3', label: 'C', textMd: 'Choice C' },
        ]}
        selectedChoiceId="c1"
        correctChoiceId="c2"
        onSelectChoice={() => {}}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const labels = Array.from(doc.querySelectorAll('label'));
    const wrongUnselected = labels.filter((label) =>
      (label.getAttribute('class') ?? '').includes('opacity-50'),
    );

    expect(wrongUnselected).toHaveLength(1);
    expect(wrongUnselected[0]?.getAttribute('class')).not.toContain(
      'opacity-60',
    );
  });
});
