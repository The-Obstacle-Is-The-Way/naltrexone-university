import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('dedupes conflicting Tailwind classes', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});
