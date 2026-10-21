import { describe, expect, it } from 'vitest';
import { markdownNormalizationCases } from '../test-helpers/markdown-normalization-cases';
import {
  canonicalizeMarkdown,
  normalizeNewlines,
  trimTrailingWhitespacePerLine,
} from './markdown-normalization';

describe('canonicalizeMarkdown', () => {
  it.each(markdownNormalizationCases)(
    'normalizes $name',
    ({ raw, canonical }) => {
      expect(canonicalizeMarkdown(raw)).toBe(canonical);
    },
  );

  it('keeps interior whitespace and blank lines', () => {
    expect(canonicalizeMarkdown('first  second\n\nthird')).toBe(
      'first  second\n\nthird',
    );
  });
});

describe('normalizeNewlines', () => {
  it('turns CRLF and lone CR into LF', () => {
    expect(normalizeNewlines('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });
});

describe('trimTrailingWhitespacePerLine', () => {
  it('removes trailing spaces and tabs from each line, not leading ones', () => {
    expect(trimTrailingWhitespacePerLine('  a \t\r\n\tb\t')).toBe('  a\n\tb');
  });
});
