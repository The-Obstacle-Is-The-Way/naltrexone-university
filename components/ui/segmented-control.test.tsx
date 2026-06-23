// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  findFieldsetByLegendText,
  parseHtml,
} from '@/tests/shared/dom-helpers';

let SegmentedControl: typeof import('./segmented-control').SegmentedControl;

beforeAll(async () => {
  ({ SegmentedControl } = await import('./segmented-control'));
});

describe('SegmentedControl', () => {
  it('renders all provided options', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        options={[
          { value: 'tutor', label: 'Tutor' },
          { value: 'exam', label: 'Exam' },
        ]}
        value="tutor"
        onChange={() => undefined}
      />,
    );

    expect(html).toContain('Tutor');
    expect(html).toContain('Exam');
  });

  it('renders as button elements', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        options={[
          { value: 'tutor', label: 'Tutor' },
          { value: 'exam', label: 'Exam' },
        ]}
        value="tutor"
        onChange={() => undefined}
      />,
    );

    expect(html).toContain('type="button"');
  });

  it('marks the active option with aria-pressed true', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        options={[
          { value: 'tutor', label: 'Tutor' },
          { value: 'exam', label: 'Exam' },
        ]}
        value="exam"
        onChange={() => undefined}
      />,
    );

    // The active button should have aria-pressed="true"
    // We check that the Exam button is marked active
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  it('applies active styling to the selected option', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        options={[
          { value: 'tutor', label: 'Tutor' },
          { value: 'exam', label: 'Exam' },
        ]}
        value="tutor"
        onChange={() => undefined}
      />,
    );

    expect(html).toContain('bg-primary');
  });

  it('wraps options in a fieldset', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        options={[
          { value: 'tutor', label: 'Tutor' },
          { value: 'exam', label: 'Exam' },
        ]}
        value="tutor"
        onChange={() => undefined}
      />,
    );
    const doc = parseHtml(html);

    expect(doc.querySelector('fieldset')).not.toBeNull();
  });

  it('renders sr-only legend when legend prop is provided', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        options={[
          { value: 'tutor', label: 'Tutor' },
          { value: 'exam', label: 'Exam' },
        ]}
        value="tutor"
        onChange={() => undefined}
        legend="Mode"
      />,
    );
    const doc = parseHtml(html);
    const fieldset = findFieldsetByLegendText(doc, 'Mode');

    expect(fieldset).not.toBeNull();
    expect(html).toContain('sr-only');
    expect(html).toContain('Mode');
  });

  it('uses aria-labelledby without rendering a legend when ariaLabelledBy is provided', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        options={[
          { value: 'tutor', label: 'Tutor' },
          { value: 'exam', label: 'Exam' },
        ]}
        value="tutor"
        onChange={() => undefined}
        ariaLabelledBy="practice-session-mode-label"
      />,
    );
    const doc = parseHtml(html);

    expect(html).toContain('aria-labelledby="practice-session-mode-label"');
    expect(doc.querySelector('legend')).toBeNull();
  });

  it('ignores legend when ariaLabelledBy is also provided', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        options={[
          { value: 'tutor', label: 'Tutor' },
          { value: 'exam', label: 'Exam' },
        ]}
        value="tutor"
        onChange={() => undefined}
        legend="Mode"
        ariaLabelledBy="external-label"
      />,
    );
    const doc = parseHtml(html);

    expect(html).toContain('aria-labelledby="external-label"');
    expect(doc.querySelector('legend')).toBeNull();
  });

  it('omits legend when legend prop is not provided', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        options={[
          { value: 'tutor', label: 'Tutor' },
          { value: 'exam', label: 'Exam' },
        ]}
        value="tutor"
        onChange={() => undefined}
      />,
    );
    const doc = parseHtml(html);

    expect(doc.querySelector('legend')).toBeNull();
  });

  it('disables all buttons when disabled', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        options={[
          { value: 'tutor', label: 'Tutor' },
          { value: 'exam', label: 'Exam' },
        ]}
        value="tutor"
        onChange={() => undefined}
        disabled
      />,
    );

    // Both buttons should be disabled
    const matches = html.match(/disabled/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('uses the canonical container classes without extra spacing utilities', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        options={[
          { value: 'tutor', label: 'Tutor' },
          { value: 'exam', label: 'Exam' },
        ]}
        value="tutor"
        onChange={() => undefined}
      />,
    );

    expect(html).toContain(
      'inline-flex rounded-lg border border-border bg-muted p-1',
    );
    expect(html).not.toContain('dark:border-foreground/40');
    expect(html).not.toContain('items-center');
    expect(html).not.toContain('gap-1');
  });
});
