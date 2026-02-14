// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  buildQuickPracticeStatusHref,
  parseStatusParam,
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
  it('returns unanswered when status param is missing', () => {
    expect(parseStatusParam(new URLSearchParams(''))).toBe('unanswered');
  });

  it('returns a valid status when provided', () => {
    expect(parseStatusParam(new URLSearchParams('status=incorrect'))).toBe(
      'incorrect',
    );
  });

  it('defaults to unanswered for invalid values', () => {
    expect(parseStatusParam(new URLSearchParams('status=unknown'))).toBe(
      'unanswered',
    );
  });

  it('defaults to unanswered for comma-separated legacy values', () => {
    expect(
      parseStatusParam(new URLSearchParams('status=unanswered,incorrect')),
    ).toBe('unanswered');
  });
});

describe('buildQuickPracticeStatusHref', () => {
  it('sets a status param when selecting a non-default status', () => {
    const href = buildQuickPracticeStatusHref({
      searchParams: new URLSearchParams(''),
      status: 'incorrect',
    });

    expect(href).toBe(`${ROUTES.APP_PRACTICE_QUICK}?status=incorrect`);
  });

  it('omits the status param when selecting unanswered (default)', () => {
    const href = buildQuickPracticeStatusHref({
      searchParams: new URLSearchParams('status=incorrect'),
      status: 'unanswered',
    });

    expect(href).toBe(ROUTES.APP_PRACTICE_QUICK);
  });

  it('preserves other query params when selecting unanswered (default)', () => {
    const href = buildQuickPracticeStatusHref({
      searchParams: new URLSearchParams('foo=bar&status=incorrect'),
      status: 'unanswered',
    });

    expect(href).toBe(`${ROUTES.APP_PRACTICE_QUICK}?foo=bar`);
  });

  it('sets bookmarked status', () => {
    const href = buildQuickPracticeStatusHref({
      searchParams: new URLSearchParams('status=incorrect'),
      status: 'bookmarked',
    });

    expect(href).toBe(`${ROUTES.APP_PRACTICE_QUICK}?status=bookmarked`);
  });
});

describe('QuickPracticeClient', () => {
  it('renders status segmented control below the page heading', async () => {
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
    expect(html).toContain('Bookmarked');

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const heading = doc.querySelector('h1');
    expect(heading?.textContent).toBe('Quick Practice');

    const statusControl = Array.from(doc.querySelectorAll('fieldset')).find(
      (fieldset) => fieldset.querySelector('legend')?.textContent === 'Status',
    );
    expect(statusControl).toBeTruthy();

    if (!heading) throw new Error('Expected heading');
    if (!statusControl) throw new Error('Expected status control');

    const position = heading.compareDocumentPosition(statusControl);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    const selected = statusControl?.querySelector(
      'button[aria-pressed="true"]',
    );
    expect(selected?.textContent).toBe('Incorrect');
  });

  it('defaults to Unanswered when status param is absent', async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams(''));

    const QuickPracticeClient = (
      await import('@/app/(app)/app/practice/quick/quick-practice-client')
    ).default;

    const html = renderToStaticMarkup(<QuickPracticeClient />);

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const statusControl = Array.from(doc.querySelectorAll('fieldset')).find(
      (fieldset) => fieldset.querySelector('legend')?.textContent === 'Status',
    );
    expect(statusControl).toBeTruthy();

    const selected = statusControl?.querySelector(
      'button[aria-pressed="true"]',
    );
    expect(selected?.textContent).toBe('Unanswered');
  });
});
