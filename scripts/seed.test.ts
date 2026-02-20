import { describe, expect, it } from 'vitest';
import { parseSeedQuestionFile } from './seed/question-parser';
import { validateSeedQuestionTags } from './seed/tag-manager';

describe('validateSeedQuestionTags', () => {
  it('rejects domain tags before minimum tag count checks', () => {
    expect(() =>
      validateSeedQuestionTags({
        slug: 'demo-000',
        tags: [
          {
            slug: 'general',
            name: 'General',
            kind: 'domain',
          },
        ],
      }),
    ).toThrow(/domain/i);
  });

  it('rejects domain tags during seed validation', () => {
    expect(() =>
      validateSeedQuestionTags({
        slug: 'demo-001',
        tags: [
          {
            slug: 'pharmacology-neuroscience',
            name: 'Pharmacology & Neuroscience',
            kind: 'domain',
          },
          {
            slug: 'opioids',
            name: 'Opioids',
            kind: 'substance',
          },
          {
            slug: 'screening-diagnosis',
            name: 'Screening & Diagnosis',
            kind: 'topic',
          },
        ],
      }),
    ).toThrow(/domain/i);
  });

  it('rejects unknown canonical slugs during seed validation', () => {
    expect(() =>
      validateSeedQuestionTags({
        slug: 'demo-002',
        tags: [
          {
            slug: 'pharmacology',
            name: 'Pharmacology',
            kind: 'topic',
          },
          {
            slug: 'opioids',
            name: 'Opioids',
            kind: 'substance',
          },
        ],
      }),
    ).toThrow(/canonical/i);
  });

  it('rejects questions missing topic tags', () => {
    expect(() =>
      validateSeedQuestionTags({
        slug: 'demo-003',
        tags: [
          {
            slug: 'naltrexone',
            name: 'Naltrexone',
            kind: 'treatment',
          },
        ],
      }),
    ).toThrow(/at least one topic/i);
  });

  it('rejects questions missing substance tags', () => {
    expect(() =>
      validateSeedQuestionTags({
        slug: 'demo-004',
        tags: [
          {
            slug: 'screening-diagnosis',
            name: 'Screening & Diagnosis',
            kind: 'topic',
          },
        ],
      }),
    ).toThrow(/at least one substance/i);
  });
});

describe('parseSeedQuestionFile', () => {
  it('includes reference_md from parsed explanation content', () => {
    const raw = [
      '---',
      'slug: "demo-100"',
      'difficulty: "easy"',
      'status: "published"',
      'tags:',
      '  - slug: "screening-diagnosis"',
      '    name: "Screening & Diagnosis"',
      '    kind: "topic"',
      '  - slug: "alcohol"',
      '    name: "Alcohol"',
      '    kind: "substance"',
      'choices:',
      '  - label: "A"',
      '    text: "Choice A"',
      '    correct: false',
      '  - label: "B"',
      '    text: "Choice B"',
      '    correct: true',
      '---',
      '',
      '## Stem',
      '',
      'What is the best answer?',
      '',
      '## Explanation',
      '',
      'General explanation.',
      '',
      '**Why other answers are wrong:**',
      '- A) Because A is incorrect.',
      '',
      '### Reference',
      '',
      "Anton RF, O'Malley SS, Ciraulo DA, et al. JAMA. 2006;295(17):2003-2017.",
      '',
    ].join('\n');

    const parsed = parseSeedQuestionFile(raw);

    expect(parsed.reference_md).toBe(
      "Anton RF, O'Malley SS, Ciraulo DA, et al. JAMA. 2006;295(17):2003-2017.",
    );
  });

  it('sets reference_md to null when no reference section exists', () => {
    const raw = [
      '---',
      'slug: "demo-101"',
      'difficulty: "easy"',
      'status: "published"',
      'tags:',
      '  - slug: "screening-diagnosis"',
      '    name: "Screening & Diagnosis"',
      '    kind: "topic"',
      '  - slug: "alcohol"',
      '    name: "Alcohol"',
      '    kind: "substance"',
      'choices:',
      '  - label: "A"',
      '    text: "Choice A"',
      '    correct: false',
      '  - label: "B"',
      '    text: "Choice B"',
      '    correct: true',
      '---',
      '',
      '## Stem',
      '',
      'What is the best answer?',
      '',
      '## Explanation',
      '',
      'General explanation.',
      '',
      '**Why other answers are wrong:**',
      '- A) Because A is incorrect.',
      '',
    ].join('\n');

    const parsed = parseSeedQuestionFile(raw);

    expect(parsed.reference_md).toBeNull();
  });
});
