// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
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

let QuickPracticeClient: typeof import('./quick-practice-client').default;
let buildQuickPracticeStatusHref: typeof import('./quick-practice-client').buildQuickPracticeStatusHref;
let parseStatusParam: typeof import('./quick-practice-client').parseStatusParam;

beforeAll(async () => {
  const module = await import('./quick-practice-client');
  QuickPracticeClient = module.default;
  buildQuickPracticeStatusHref = module.buildQuickPracticeStatusHref;
  parseStatusParam = module.parseStatusParam;
});

describe('parseStatusParam', () => {
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
  it('defaults to Unanswered when status param is absent', () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams(''));

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
