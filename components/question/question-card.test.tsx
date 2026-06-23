// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  findFieldsetByLegendText,
  parseHtml,
} from '@/tests/shared/dom-helpers';

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

    const doc = parseHtml(html);
    const stemParagraph = Array.from(doc.querySelectorAll('p')).find(
      (paragraph) => paragraph.textContent?.trim() === 'Stem paragraph',
    );
    const fieldset = findFieldsetByLegendText(doc, 'Answer choices');

    expect(stemParagraph).not.toBeUndefined();
    expect(fieldset).not.toBeNull();
    expect(stemParagraph?.parentElement?.className).toContain('text-base');
    expect(fieldset?.className).toContain('mt-8');
    expect(html).toContain('Choice A');
    expect(html).toContain('Choice B');
    expect(html).toContain('Answer choices');
  });

  it('styles wrong-unselected answers without dimming the entire label subtree', () => {
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
    const wrongUnselected = labels.find((label) =>
      label.textContent?.includes('Choice C'),
    );
    const wrongUnselectedText = Array.from(doc.querySelectorAll('p')).find(
      (paragraph) => paragraph.textContent?.trim() === 'Choice C',
    );

    expect(wrongUnselected).not.toBeUndefined();
    expect(wrongUnselected?.getAttribute('class')).not.toContain('opacity-50');
    expect(wrongUnselectedText).not.toBeUndefined();
    expect(wrongUnselectedText?.parentElement?.getAttribute('class')).toContain(
      'text-foreground',
    );
    expect(
      wrongUnselectedText?.parentElement?.getAttribute('class'),
    ).not.toContain('text-muted-foreground');
  });
});
