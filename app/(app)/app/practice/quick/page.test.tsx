// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

let QuickPracticePage: typeof import('@/app/(app)/app/practice/quick/page').default;

beforeAll(async () => {
  QuickPracticePage = (await import('@/app/(app)/app/practice/quick/page'))
    .default;
});

describe('app/(app)/app/practice/quick', () => {
  it('renders a quick practice shell', () => {
    const html = renderToStaticMarkup(<QuickPracticePage />);
    expect(html).toContain('Quick Practice');
    expect(html).toContain('← Back to Practice');
  });
});
