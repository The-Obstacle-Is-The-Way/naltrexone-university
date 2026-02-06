import { describe, expect, it } from 'vitest';
import { getStemPreview } from './stem-preview';

describe('getStemPreview', () => {
  it('returns plain text when already short', () => {
    expect(getStemPreview('A short stem', 100)).toBe('A short stem');
  });

  it('truncates long text with ellipsis', () => {
    expect(
      getStemPreview('A very long stem that should be truncated', 18),
    ).toBe('A very long ste...');
  });

  it('strips markdown formatting and links', () => {
    expect(
      getStemPreview('# Heading with [link](https://example.com)', 100),
    ).toBe('Heading with link');
  });

  it('strips markdown image syntax without leaving a leading exclamation point', () => {
    expect(
      getStemPreview('![CT scan](https://example.com/image.png)', 100),
    ).toBe('CT scan');
  });
});
