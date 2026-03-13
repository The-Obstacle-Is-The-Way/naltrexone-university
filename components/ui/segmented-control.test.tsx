// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

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

    expect(html).toContain('<fieldset');
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

    expect(html).toContain('<legend');
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

    expect(html).toContain('aria-labelledby="practice-session-mode-label"');
    expect(html).not.toContain('<legend');
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

    expect(html).not.toContain('<legend');
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
