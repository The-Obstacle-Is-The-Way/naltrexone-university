// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('app/error', () => {
  it('renders a recoverable error UI', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ErrorPage = (await import('./error')).default;

    const error = new Error('boom');
    render(<ErrorPage error={error} reset={() => {}} />);

    expect(
      screen.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();

    expect(errorSpy).toHaveBeenCalledWith('app/error.tsx:', error);
    errorSpy.mockRestore();
  });
});
