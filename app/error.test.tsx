'use client';

import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

describe('app/error', () => {
  it('renders a recoverable error UI', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ErrorPage = (await import('./error')).default;

    const error = new Error('boom');
    const tree = create(<ErrorPage error={error} reset={() => {}} />);
    await act(async () => {
      tree.update(<ErrorPage error={error} reset={() => {}} />);
    });

    expect(tree.root.findByType('h2').children.join('')).toBe(
      'Something went wrong',
    );
    expect(tree.root.findByType('button').children.join('')).toBe('Try again');

    expect(errorSpy).toHaveBeenCalledWith('app/error.tsx:', error);
  });
});
