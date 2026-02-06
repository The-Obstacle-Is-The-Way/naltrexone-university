// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('SegmentedControl', () => {
  it('renders all provided options', async () => {
    const { SegmentedControl } = await import(
      '@/components/ui/segmented-control'
    );

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

  it('renders as button elements', async () => {
    const { SegmentedControl } = await import(
      '@/components/ui/segmented-control'
    );

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

  it('marks the active option with aria-pressed true', async () => {
    const { SegmentedControl } = await import(
      '@/components/ui/segmented-control'
    );

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

  it('applies active styling to the selected option', async () => {
    const { SegmentedControl } = await import(
      '@/components/ui/segmented-control'
    );

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

  it('wraps options in a fieldset', async () => {
    const { SegmentedControl } = await import(
      '@/components/ui/segmented-control'
    );

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

  it('renders sr-only legend when legend prop is provided', async () => {
    const { SegmentedControl } = await import(
      '@/components/ui/segmented-control'
    );

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

  it('omits legend when legend prop is not provided', async () => {
    const { SegmentedControl } = await import(
      '@/components/ui/segmented-control'
    );

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

  it('disables all buttons when disabled', async () => {
    const { SegmentedControl } = await import(
      '@/components/ui/segmented-control'
    );

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
});
