// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

const fixtureChoiceAId = crypto.randomUUID();
const fixtureChoiceBId = crypto.randomUUID();

type QuestionSurfaceBodyModule = typeof import('./question-surface-body');

let QuestionSurfaceBody: QuestionSurfaceBodyModule['QuestionSurfaceBody'];

beforeAll(async () => {
  ({ QuestionSurfaceBody } = await import('./question-surface-body'));
});

describe('QuestionSurfaceBody', () => {
  function renderQuestionSurfaceBody(
    overrides: Partial<Parameters<typeof QuestionSurfaceBody>[0]> = {},
  ) {
    const html = renderToStaticMarkup(
      <QuestionSurfaceBody
        question={{
          stemMd: 'Question stem',
          choices: [
            { id: fixtureChoiceAId, label: 'A', textMd: 'Choice A' },
            { id: fixtureChoiceBId, label: 'B', textMd: 'Choice B' },
          ],
        }}
        selectedChoiceId={fixtureChoiceAId}
        correctChoiceId={fixtureChoiceBId}
        disabled={false}
        onSelectChoice={() => undefined}
        {...overrides}
      />,
    );

    return {
      html,
      doc: new DOMParser().parseFromString(html, 'text/html'),
    };
  }

  it('renders the question card with stem, choices, and selected/correct choice state', () => {
    const { html, doc } = renderQuestionSurfaceBody();
    const selectedInput = doc.querySelector('input[type="radio"][value="A"]');
    const selectedChoice = Array.from(doc.querySelectorAll('label')).find(
      (label) => label.textContent?.includes('Choice A'),
    );
    const correctChoice = Array.from(doc.querySelectorAll('label')).find(
      (label) => label.textContent?.includes('Choice B'),
    );

    expect(html).toContain('Question stem');
    expect(html).toContain('Choice A');
    expect(html).toContain('Choice B');
    expect(selectedInput?.hasAttribute('checked')).toBe(true);
    expect(selectedChoice?.className).toContain('border-destructive');
    expect(correctChoice?.className).toContain('border-success');
  });

  it('renders feedback when feedback props are provided', () => {
    const { html, doc } = renderQuestionSurfaceBody({
      feedback: {
        isCorrect: false,
        explanationMd: 'Overall explanation',
        referenceMd: 'Reference text',
        choiceExplanations: [
          {
            choiceId: fixtureChoiceAId,
            displayLabel: 'A',
            textMd: 'Choice A',
            isCorrect: false,
            explanationMd: 'Selected choice explanation',
          },
          {
            choiceId: fixtureChoiceBId,
            displayLabel: 'B',
            textMd: 'Choice B',
            isCorrect: true,
            explanationMd: 'Correct choice explanation',
          },
        ],
      },
    });
    const verdictPill = doc.querySelector('[data-testid="verdict-pill"]');
    const selectedAnswerCard = Array.from(doc.querySelectorAll('div')).find(
      (element) => {
        const className = element.getAttribute('class') ?? '';
        return (
          className.includes('border-destructive') &&
          className.includes('bg-destructive/5')
        );
      },
    );

    expect(verdictPill?.textContent?.trim()).toBe('Incorrect');
    expect(selectedAnswerCard).not.toBeUndefined();
    expect(html).toContain('Overall explanation');
    expect(html).toContain('Reference text');
  });

  it('does not render feedback when feedback is null', () => {
    const { html, doc } = renderQuestionSurfaceBody({ feedback: null });

    expect(doc.querySelector('[role="status"]')).toBeNull();
    expect(html).not.toContain('Overall explanation');
  });

  it('renders feedback without a question card when question is null', () => {
    const { html, doc } = renderQuestionSurfaceBody({
      question: null,
      feedback: {
        isCorrect: true,
        explanationMd: 'Standalone feedback explanation',
        referenceMd: null,
        choiceExplanations: [],
      },
    });

    expect(doc.querySelector('fieldset')).toBeNull();
    expect(doc.querySelector('[role="status"]')).not.toBeNull();
    expect(html).toContain('Standalone feedback explanation');
  });

  it('renders beforeQuestionCard content before the question card', () => {
    const { html } = renderQuestionSurfaceBody({
      beforeQuestionCard: (
        <div data-testid="before-question-card">Before question card</div>
      ),
    });

    expect(html).toContain('Before question card');
    expect(html.indexOf('Before question card')).toBeLessThan(
      html.indexOf('Question stem'),
    );
  });

  it('does not render beforeQuestionCard content when question is null', () => {
    const { html } = renderQuestionSurfaceBody({
      question: null,
      beforeQuestionCard: (
        <div data-testid="before-question-card">Before question card</div>
      ),
    });

    expect(html).not.toContain('Before question card');
  });

  it('renders the question card when choice objects include extra fields', () => {
    const question = {
      stemMd: 'Question stem',
      choices: [
        {
          id: fixtureChoiceAId,
          label: 'A',
          textMd: 'Choice A',
          sortOrder: 1,
        },
      ],
    };

    const html = renderToStaticMarkup(
      <QuestionSurfaceBody
        question={question}
        selectedChoiceId={null}
        correctChoiceId={null}
        disabled={false}
        onSelectChoice={() => undefined}
      />,
    );

    expect(html).toContain('Question stem');
    expect(html).toContain('Choice A');
  });
});
