// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Feedback } from '@/components/question/feedback';

describe('Feedback', () => {
  it('renders correct feedback with explanation', () => {
    const html = renderToStaticMarkup(
      <Feedback isCorrect={true} explanationMd="Because..." />,
    );

    expect(html).toContain('Correct');
    expect(html).toContain('Because...');
  });

  it('announces feedback for assistive tech', () => {
    const html = renderToStaticMarkup(
      <Feedback isCorrect={true} explanationMd="Because..." />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('renders non-null choice explanations in display-label order', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: true,
            explanationMd: null,
          },
        ]}
      />,
    );

    expect(html).toContain('Why other answers are wrong:');
    expect(html).toContain('A)');
    expect(html).toContain('First option');
    expect(html).toContain('First option is incorrect.');
    expect(html).not.toContain('B) Second option');
  });

  it('falls back to general explanation when an incorrect choice explanation is missing', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="Fallback explanation."
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: null,
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: true,
            explanationMd: 'Correct rationale.',
          },
        ]}
      />,
    );

    expect(html).toContain('Fallback explanation.');
    expect(html).not.toContain('Why other answers are wrong:');
  });

  it('renders reference section when referenceMd is provided', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={true}
        explanationMd="Because..."
        referenceMd="Anton RF et al. JAMA. 2006;295(17):2003-2017."
      />,
    );

    expect(html).toContain('Reference');
    expect(html).toContain('Anton RF et al. JAMA. 2006;295(17):2003-2017.');
  });

  it('does not render reference section when referenceMd is null', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={true}
        explanationMd="Because..."
        referenceMd={null}
      />,
    );

    expect(html).not.toContain('Reference');
  });
});
