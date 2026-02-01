// @vitest-environment jsdom
'use client';

import { act } from 'react';
import { create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

describe('app/global-error', () => {
  it('renders a full-document error UI', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const GlobalErrorPage = (await import('./global-error')).default;

    const error = new Error('boom');
    const tree = create(<GlobalErrorPage error={error} reset={() => {}} />);
    await act(async () => {
      tree.update(<GlobalErrorPage error={error} reset={() => {}} />);
    });

    expect(tree.root.findByType('html')).toBeDefined();
    expect(tree.root.findByType('h1').children.join('')).toBe(
      'Something went wrong',
    );
    expect(tree.root.findByType('button').children.join('')).toBe('Try again');

    expect(errorSpy).toHaveBeenCalledWith('app/global-error.tsx:', error);
  });
});
