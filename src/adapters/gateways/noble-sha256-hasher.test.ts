import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NobleSha256Hasher } from './noble-sha256-hasher';

describe('NobleSha256Hasher', () => {
  it('returns the lowercase hexadecimal SHA-256 digest', () => {
    const input = 'immutable renewal notice payload';

    expect(new NobleSha256Hasher().hash(input)).toBe(
      createHash('sha256').update(input).digest('hex'),
    );
  });
});
