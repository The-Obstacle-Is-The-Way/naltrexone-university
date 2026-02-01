// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('app/pricing', () => {
  it('renders subscribe actions', async () => {
    const PricingPage = (await import('./page')).default;

    render(<PricingPage />);

    expect(
      screen.getByRole('button', { name: 'Subscribe Monthly' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Subscribe Annual' }),
    ).toBeInTheDocument();
  });
});
