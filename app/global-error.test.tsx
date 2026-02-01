// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('app/global-error', () => {
  it('renders a full-document error UI', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const GlobalErrorPage = (await import('./global-error')).default;

    const error = new Error('boom');
    render(<GlobalErrorPage error={error} reset={() => {}} />);

    expect(
      screen.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();

    expect(errorSpy).toHaveBeenCalledWith('app/global-error.tsx:', error);
    errorSpy.mockRestore();
  });
});
