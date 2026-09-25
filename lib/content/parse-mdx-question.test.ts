import { describe, expect, it } from 'vitest';
import {
  canonicalizeMarkdown,
  canonicalJsonString,
  sha256Hex,
} from './parse-mdx-question';

// The seed syncer compares sha256Hex(canonicalJsonString(...)) of a question
// read from its file with the same hash of the question read from the
// database. Equal content must hash equally across both representations, and
// any change to that hash forces every question through a resync.
describe('seed content canonicalization', () => {
  it('normalizes line endings and trailing whitespace in markdown', () => {
    expect(
      canonicalizeMarkdown(
        '\r\n  Stem line one  \r\nline two\t\r\rline four \n\n',
      ),
    ).toBe('Stem line one\nline two\n\nline four');
  });

  it('serializes objects with sorted keys at every depth', () => {
    expect(
      canonicalJsonString({
        slug: 'q-1',
        choices: [{ text_md: 'A', label: 'A', is_correct: true }],
        difficulty: 'easy',
      }),
    ).toBe(
      '{"choices":[{"is_correct":true,"label":"A","text_md":"A"}],"difficulty":"easy","slug":"q-1"}',
    );
  });

  it('keeps array order, since choice and tag order is content', () => {
    expect(canonicalJsonString({ tags: ['b', 'a'] })).toBe(
      '{"tags":["b","a"]}',
    );
  });

  it('serializes file and database text equally when only line endings and trailing whitespace differ', () => {
    const fromFile = { stem_md: 'Line one  \r\nLine two\t' };
    const fromDatabase = { stem_md: 'Line one\nLine two' };

    expect(canonicalJsonString(fromFile)).toBe(
      canonicalJsonString(fromDatabase),
    );
  });

  it('preserves numbers, booleans and nulls', () => {
    expect(
      canonicalJsonString({ order: 2, is_correct: false, reference_md: null }),
    ).toBe('{"is_correct":false,"order":2,"reference_md":null}');
  });

  it('hashes canonical JSON as lowercase SHA-256 hex', () => {
    expect(sha256Hex(canonicalJsonString({ slug: 'q-1' }))).toBe(
      '281d3bb2f5084f0a8da774aaea24c28addb2b49fbd3b3119e8546f89ca2fd94a',
    );
  });
});
