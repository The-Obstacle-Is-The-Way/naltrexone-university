import { describe, expect, it } from 'vitest';
import { parseExplanationAndReference } from './seed-helpers';

function getErrorMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error('Expected function to throw');
}

describe('parseExplanationAndReference', () => {
  it('splits general explanation from a trailing reference section', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Clinical pearl:** Keep naloxone first-line.',
      '',
      '### Reference',
      '',
      'A concise AMA citation.',
    ].join('\n');

    const parsed = parseExplanationAndReference(explanationMd);

    expect(parsed.generalExplanation).toBe(
      [
        'General rationale paragraph.',
        '',
        '**Clinical pearl:** Keep naloxone first-line.',
      ].join('\n'),
    );
    expect(parsed.referenceMd).toBe('A concise AMA citation.');
  });

  it('returns null reference when no reference heading exists', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Clinical pearl:** Keep naloxone first-line.',
    ].join('\n');

    const parsed = parseExplanationAndReference(explanationMd);

    expect(parsed.generalExplanation).toBe(explanationMd);
    expect(parsed.referenceMd).toBeNull();
  });

  it('returns an empty general explanation when the body only contains a reference section', () => {
    const explanationMd = ['### Reference', '', 'A concise AMA citation.'].join(
      '\n',
    );

    const parsed = parseExplanationAndReference(explanationMd);

    expect(parsed.generalExplanation).toBe('');
    expect(parsed.referenceMd).toBe('A concise AMA citation.');
  });

  it('keeps the clinical pearl in general explanation when it appears before reference', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Clinical pearl:** Keep naloxone first-line.',
      '',
      '### Reference',
      '',
      'A concise AMA citation.',
    ].join('\n');

    const parsed = parseExplanationAndReference(explanationMd);

    expect(parsed.generalExplanation).toContain(
      '**Clinical pearl:** Keep naloxone first-line.',
    );
    expect(parsed.referenceMd).toBe('A concise AMA citation.');
  });

  it('rejects additional section headings after the reference section begins', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '### Reference',
      '',
      'A concise AMA citation.',
      '',
      '### Notes',
      '',
      'This should not be accepted.',
    ].join('\n');

    const message = getErrorMessage(() =>
      parseExplanationAndReference(explanationMd),
    );

    expect(message).toContain('reference section must be terminal');
    expect(message).toContain('### Notes');
  });
});
