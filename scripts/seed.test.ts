import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSeedQuestionFile } from './seed/question-parser';
import { validateSeedQuestionTags } from './seed/tag-manager';

function readSeedFixture(fileName: string): string {
  return readFileSync(
    path.join(process.cwd(), 'tests/fixtures/seed', fileName),
    'utf8',
  );
}

function readPlaceholderSeedFiles(): Array<{ fileName: string; raw: string }> {
  const dir = path.join(process.cwd(), 'content/questions/placeholder');
  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.mdx'))
    .sort()
    .map((fileName) => ({
      fileName,
      raw: readFileSync(path.join(dir, fileName), 'utf8'),
    }));
}

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
  it('uses YAML explanations and extracts reference_md for new-format MDX', () => {
    const raw = readSeedFixture('new-format-example.mdx');

    const parsed = parseSeedQuestionFile(raw);

    expect(parsed.explanation_md).toBe(
      [
        'Palis et al. (2022) found that concurrent users had more than twice the hazard of fatal overdose.',
        '',
        '**Clinical pearl:** The belief that stimulants can prevent opioid overdose is false and dangerous.',
      ].join('\n'),
    );
    expect(parsed.reference_md).toBe(
      'Palis H, Xavier C, Dobrer S, et al. Concurrent use of opioids and stimulants and risk of fatal overdose. BMC Public Health. 2022;22:2084.',
    );
    expect(parsed.choices).toEqual([
      {
        label: 'A',
        text_md: 'Concurrent use decreases fatal overdose risk...',
        is_correct: false,
        explanation_md:
          'This is a dangerous misconception; stimulants do NOT protect against opioid overdose.',
        sort_order: 1,
      },
      {
        label: 'B',
        text_md: 'Concurrent use approximately doubles the hazard...',
        is_correct: true,
        explanation_md: null,
        sort_order: 2,
      },
      {
        label: 'C',
        text_md: 'Concurrent use has no effect...',
        is_correct: false,
        explanation_md: 'The hazard was significantly elevated, not unchanged.',
        sort_order: 3,
      },
      {
        label: 'D',
        text_md: 'Concurrent use only increases risk if injection...',
        is_correct: false,
        explanation_md:
          'The study found elevated risk overall, not limited to injection-only use.',
        sort_order: 4,
      },
    ]);
  });

  it('rejects hybrid questions that mix YAML explanations with a wrong-answer markdown section', () => {
    const raw = [
      '---',
      'slug: "demo-hybrid-100"',
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
      '    explanation: "Because A is incorrect."',
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

    expect(() => parseSeedQuestionFile(raw)).toThrow(
      /demo-hybrid-100: .*Why other answers are wrong/i,
    );
  });

  it('rejects new-format questions when a wrong choice is missing explanation', () => {
    const raw = [
      '---',
      'slug: "demo-new-missing-100"',
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
      '    explanation: "Because A is incorrect."',
      '  - label: "B"',
      '    text: "Choice B"',
      '    correct: true',
      '  - label: "C"',
      '    text: "Choice C"',
      '    correct: false',
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
      '### Reference',
      '',
      'A concise AMA citation.',
      '',
    ].join('\n');

    expect(() => parseSeedQuestionFile(raw)).toThrow(
      /wrong choices must include explanation/i,
    );
  });

  it('includes reference_md from parsed explanation content for new-format questions', () => {
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
      '    explanation: "Because A is incorrect."',
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

  it('sets reference_md to null when no reference section exists for new-format questions', () => {
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
      '    explanation: "Because A is incorrect."',
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
    ].join('\n');

    const parsed = parseSeedQuestionFile(raw);

    expect(parsed.reference_md).toBeNull();
  });

  it('parses all tracked placeholder seed files with the Phase 2 schema', () => {
    const placeholders = readPlaceholderSeedFiles();

    expect(placeholders.length).toBeGreaterThan(0);
    for (const placeholder of placeholders) {
      expect(() => parseSeedQuestionFile(placeholder.raw)).not.toThrow();
    }
  });
});
