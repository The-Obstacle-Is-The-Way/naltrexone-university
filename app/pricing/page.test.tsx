'use client';

import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('app/pricing', () => {
  it('renders subscribe actions', async () => {
    const PricingPage = (await import('./page')).default;

    const tree = create(<PricingPage />);
    await act(async () => {
      tree.update(<PricingPage />);
    });

    const buttons = tree.root.findAllByType('button');
    const labels = buttons.map((b) => b.children.join(''));

    expect(labels).toContain('Subscribe Monthly');
    expect(labels).toContain('Subscribe Annual');
  });
});
