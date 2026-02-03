// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // biome-ignore lint/performance/noImgElement: next/image is mocked for static render tests
    <img alt="" {...props} />
  ),
}));

describe('components/kokonutui/Dashboard', () => {
  it('renders the dashboard content sections', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const Dashboard = (await import('./dashboard')).default;

    const html = renderToStaticMarkup(<Dashboard />);

    expect(html).toContain('Accounts');
    expect(html).toContain('Recent Transactions');
    expect(html).toContain('Upcoming Events');
  });
});
