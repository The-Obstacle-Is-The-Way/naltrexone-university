import { describe, expect, it } from 'vitest';
import {
  type MigrationInput,
  migrateQuestionTags,
  parseCliArgs,
} from './migrate-tag-taxonomy';
import { tagsSignature } from './migrate-tag-taxonomy/tag-parsers';

function createInput(overrides?: Partial<MigrationInput>): MigrationInput {
  return {
    filePath: 'content/questions/imported/demo/source/demo-001.mdx',
    stemMd: 'Question stem',
    explanationMd: 'Explanation text',
    choices: [{ text: 'Choice A' }, { text: 'Choice B' }],
    tags: [
      { slug: 'alcohol', name: 'Alcohol', kind: 'substance' },
      {
        slug: 'treatment-pharmacotherapy',
        name: 'Treatment & Pharmacotherapy',
        kind: 'topic',
      },
    ],
    ...overrides,
  };
}

describe('migrateQuestionTags', () => {
  it('maps legacy domain/topic tags to canonical topics and removes domain tags', () => {
    const tags = migrateQuestionTags(
      createInput({
        tags: [
          {
            slug: 'pharmacology-neuroscience',
            name: 'Pharmacology & Neuroscience',
            kind: 'domain',
          },
          { slug: 'neurobiology', name: 'Neurobiology', kind: 'topic' },
          { slug: 'pharmacology', name: 'Pharmacology', kind: 'topic' },
          { slug: 'alcohol', name: 'Alcohol', kind: 'substance' },
        ],
      }),
    );

    expect(tags.some((tag) => tag.kind === 'domain')).toBe(false);
    expect(tags).toContainEqual({
      slug: 'pharmacology-neuroscience',
      name: 'Pharmacology & Neuroscience',
      kind: 'topic',
    });
    expect(tags.find((tag) => tag.slug === 'neurobiology')).toBeUndefined();
    expect(tags.find((tag) => tag.slug === 'pharmacology')).toBeUndefined();
  });

  it('remaps ethics-legal-policy domain slug to ethics-legal topic slug', () => {
    const tags = migrateQuestionTags(
      createInput({
        tags: [
          {
            slug: 'ethics-legal-policy',
            name: 'Ethics, Legal & Policy',
            kind: 'domain',
          },
          { slug: 'alcohol', name: 'Alcohol', kind: 'substance' },
          { slug: 'screening', name: 'Screening', kind: 'topic' },
        ],
      }),
    );

    expect(tags).toContainEqual({
      slug: 'ethics-legal',
      name: 'Ethics & Legal',
      kind: 'topic',
    });
    expect(
      tags.find((tag) => tag.slug === 'ethics-legal-policy'),
    ).toBeUndefined();
  });

  it('maps co-occurring-complications domain to co-occurring-disorders when comorbidity topic present', () => {
    const tags = migrateQuestionTags(
      createInput({
        tags: [
          {
            slug: 'co-occurring-complications',
            name: 'Co-occurring & Medical Complications',
            kind: 'domain',
          },
          { slug: 'comorbidity', name: 'Comorbidity', kind: 'topic' },
          { slug: 'alcohol', name: 'Alcohol', kind: 'substance' },
        ],
      }),
    );

    expect(tags).toContainEqual({
      slug: 'co-occurring-disorders',
      name: 'Co-occurring Disorders',
      kind: 'topic',
    });
  });

  it('maps co-occurring-complications domain to medical-complications when that topic present', () => {
    const tags = migrateQuestionTags(
      createInput({
        tags: [
          {
            slug: 'co-occurring-complications',
            name: 'Co-occurring & Medical Complications',
            kind: 'domain',
          },
          {
            slug: 'medical-complications',
            name: 'Medical Complications',
            kind: 'topic',
          },
          { slug: 'alcohol', name: 'Alcohol', kind: 'substance' },
        ],
      }),
    );

    expect(tags).toContainEqual({
      slug: 'medical-complications',
      name: 'Medical Complications',
      kind: 'topic',
    });
  });

  it('fails for co-occurring-complications with no disambiguating topic', () => {
    expect(() =>
      migrateQuestionTags(
        createInput({
          tags: [
            {
              slug: 'co-occurring-complications',
              name: 'Co-occurring & Medical Complications',
              kind: 'domain',
            },
            { slug: 'screening', name: 'Screening', kind: 'topic' },
            { slug: 'alcohol', name: 'Alcohol', kind: 'substance' },
          ],
        }),
      ),
    ).toThrow(/co-occurring-complications/i);
  });

  it('retags placeholder rogue topics', () => {
    const placeholder07 = migrateQuestionTags(
      createInput({
        filePath:
          'content/questions/placeholder/placeholder-07-stimulant-intoxication-management.mdx',
        tags: [
          { slug: 'topic', name: 'Topic', kind: 'topic' },
          { slug: 'stimulants', name: 'Stimulants', kind: 'substance' },
        ],
      }),
    );

    expect(placeholder07).toContainEqual({
      slug: 'intoxication-toxicology',
      name: 'Intoxication & Toxicology',
      kind: 'topic',
    });
    expect(placeholder07.find((tag) => tag.slug === 'topic')).toBeUndefined();

    const placeholder08 = migrateQuestionTags(
      createInput({
        filePath:
          'content/questions/placeholder/placeholder-08-psychosocial-tx-motivational-interviewing.mdx',
        tags: [
          { slug: 'psychosocial', name: 'Psychosocial', kind: 'topic' },
          { slug: 'alcohol', name: 'Alcohol', kind: 'substance' },
        ],
      }),
    );

    expect(placeholder08).toContainEqual({
      slug: 'psychosocial-interventions',
      name: 'Psychosocial Interventions',
      kind: 'topic',
    });
  });

  it('fails when migrated question has no topic', () => {
    expect(() =>
      migrateQuestionTags(
        createInput({
          tags: [{ slug: 'alcohol', name: 'Alcohol', kind: 'substance' }],
        }),
      ),
    ).toThrow(/at least one topic/i);
  });

  it('fails when migrated question has no substance', () => {
    expect(() =>
      migrateQuestionTags(
        createInput({
          tags: [
            {
              slug: 'screening-diagnosis',
              name: 'Screening & Diagnosis',
              kind: 'topic',
            },
          ],
        }),
      ),
    ).toThrow(/at least one substance/i);
  });

  it('adds treatment tags from medication mentions in question text', () => {
    const tags = migrateQuestionTags(
      createInput({
        stemMd:
          'A patient with AUD may benefit from naltrexone or acamprosate.',
        explanationMd:
          'Nicotine patch can be offered as nicotine replacement therapy.',
      }),
    );

    expect(tags).toContainEqual({
      slug: 'naltrexone',
      name: 'Naltrexone',
      kind: 'treatment',
    });
    expect(tags).toContainEqual({
      slug: 'acamprosate',
      name: 'Acamprosate',
      kind: 'treatment',
    });
    expect(tags).toContainEqual({
      slug: 'nrt',
      name: 'NRT',
      kind: 'treatment',
    });
  });

  it('applies canonical display names, not titleCaseFromSlug', () => {
    const tags = migrateQuestionTags(
      createInput({
        tags: [
          { slug: 'comorbidity', name: 'Comorbidity', kind: 'topic' },
          { slug: 'alcohol', name: 'Alcohol', kind: 'substance' },
        ],
      }),
    );

    expect(tags).toContainEqual({
      slug: 'co-occurring-disorders',
      name: 'Co-occurring Disorders',
      kind: 'topic',
    });
  });

  it('deduplicates tags when domain and topic map to same slug', () => {
    const tags = migrateQuestionTags(
      createInput({
        tags: [
          {
            slug: 'pharmacology-neuroscience',
            name: 'Pharmacology & Neuroscience',
            kind: 'domain',
          },
          { slug: 'pharmacology', name: 'Pharmacology', kind: 'topic' },
          { slug: 'opioids', name: 'Opioids', kind: 'substance' },
        ],
      }),
    );

    expect(
      tags.filter((tag) => tag.slug === 'pharmacology-neuroscience'),
    ).toHaveLength(1);
  });

  it('fails when duplicate slug has conflicting names', () => {
    expect(() =>
      migrateQuestionTags(
        createInput({
          tags: [
            {
              slug: 'screening-diagnosis',
              name: 'Screening & Diagnosis',
              kind: 'topic',
            },
            { slug: 'alcohol', name: 'Alcohol', kind: 'substance' },
            {
              slug: 'opioid-use-disorder',
              name: 'Opioid Use Disorder',
              kind: 'diagnosis',
            },
            {
              slug: 'opioid-use-disorder',
              name: 'OUD',
              kind: 'diagnosis',
            },
          ],
        }),
      ),
    ).toThrow(/conflicting names/i);
  });
});

describe('parseCliArgs', () => {
  it('defaults to dry-run with no arguments', () => {
    expect(parseCliArgs([])).toEqual({ mode: 'dry-run', reportPath: null });
  });

  it('parses --write mode', () => {
    expect(parseCliArgs(['--write'])).toEqual({
      mode: 'write',
      reportPath: null,
    });
  });

  it('parses --report with a valid path', () => {
    expect(parseCliArgs(['--report', 'out.json'])).toEqual({
      mode: 'dry-run',
      reportPath: 'out.json',
    });
  });

  it('rejects --report when the next token is another flag', () => {
    expect(() => parseCliArgs(['--report', '--write'])).toThrow(
      /missing value for --report/i,
    );
  });
});

describe('tagsSignature', () => {
  it('is order-sensitive by design', () => {
    const tags: MigrationInput['tags'] = [
      { slug: 'alcohol', name: 'Alcohol', kind: 'substance' },
      {
        slug: 'screening-diagnosis',
        name: 'Screening & Diagnosis',
        kind: 'topic',
      },
    ];

    const reversed: MigrationInput['tags'] = [tags[1], tags[0]];

    expect(tagsSignature(tags)).not.toBe(tagsSignature(reversed));
  });
});
