// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  buildQuickPracticeStatusHref,
  parseStatusParams,
} from '@/app/(app)/app/practice/quick/quick-practice-client';
import { ROUTES } from '@/lib/routes';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

const { pushMock, useSearchParamsMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useSearchParamsMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => useSearchParamsMock(),
}));

describe('parseStatusParams', () => {
  it('returns empty array when status param is missing', () => {
    expect(parseStatusParams(new URLSearchParams(''))).toEqual([]);
  });

  it('parses comma-separated statuses and ignores unknown values', () => {
    expect(
      parseStatusParams(
        new URLSearchParams('status=unanswered,unknown,incorrect'),
      ),
    ).toEqual(['unanswered', 'incorrect']);
  });
});

describe('buildQuickPracticeStatusHref', () => {
  it('adds a status param when selecting a status', () => {
    const href = buildQuickPracticeStatusHref({
      searchParams: new URLSearchParams(''),
      currentStatuses: [],
      toggledStatus: 'incorrect',
    });

    expect(href).toBe(`${ROUTES.APP_PRACTICE_QUICK}?status=incorrect`);
  });

  it('removes the status param when toggling off the last selected status', () => {
    const href = buildQuickPracticeStatusHref({
      searchParams: new URLSearchParams('status=incorrect'),
      currentStatuses: ['incorrect'],
      toggledStatus: 'incorrect',
    });

    expect(href).toBe(ROUTES.APP_PRACTICE_QUICK);
  });

  it('preserves other query params when toggling off the last selected status', () => {
    const href = buildQuickPracticeStatusHref({
      searchParams: new URLSearchParams('foo=bar&status=incorrect'),
      currentStatuses: ['incorrect'],
      toggledStatus: 'incorrect',
    });

    expect(href).toBe(`${ROUTES.APP_PRACTICE_QUICK}?foo=bar`);
  });

  it('adds the toggled status to the end of the list', () => {
    const href = buildQuickPracticeStatusHref({
      searchParams: new URLSearchParams('status=incorrect'),
      currentStatuses: ['incorrect'],
      toggledStatus: 'marked',
    });

    expect(href).toBe(`${ROUTES.APP_PRACTICE_QUICK}?status=incorrect%2Cmarked`);
  });
});

describe('QuickPracticeClient', () => {
  it('renders status filter chips and reflects selected values from URL', async () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('status=incorrect'),
    );

    const QuickPracticeClient = (
      await import('@/app/(app)/app/practice/quick/quick-practice-client')
    ).default;

    const html = renderToStaticMarkup(<QuickPracticeClient />);

    expect(html).toContain('Status');
    expect(html).toContain('Unanswered');
    expect(html).toContain('Incorrect');
    expect(html).toContain('Marked');

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const selected = doc.querySelector(
      'fieldset[aria-label="Status"] button[aria-pressed="true"]',
    );
    expect(selected?.textContent).toBe('Incorrect');
  });

  it('renders no selected chips when status param is absent', async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams(''));

    const QuickPracticeClient = (
      await import('@/app/(app)/app/practice/quick/quick-practice-client')
    ).default;

    const html = renderToStaticMarkup(<QuickPracticeClient />);

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const selected = doc.querySelectorAll(
      'fieldset[aria-label="Status"] button[aria-pressed="true"]',
    );
    expect(selected).toHaveLength(0);
  });
});
