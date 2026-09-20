import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  convertDraftQuestionToMdx,
  parseDraftQuestionBlock,
} from './draft-question-import';
import { parseSeedQuestionFile } from './seed/question-parser';

const choices = [
  'choices:',
  '  - {label: A, text: First, correct: true}',
  '  - {label: B, text: Second, correct: false, explanation: Reason.}',
];
const explanation =
  'General explanation.\n\n### Reference\n\nSynthetic citation.';

function body(stem: string, explanationMd: string): string {
  return `## Stem\n\n${stem}\n\n## Explanation\n\n${explanationMd}`;
}

function draft(bodyMd: string, qid = 'fixture-001'): string {
  return [
    '---',
    `qid: ${qid}`,
    'type: recall',
    'difficulty: easy',
    'substances: [alcohol]',
    'topics: [general]',
    'source: fixture-source',
    ...choices,
    '---',
    bodyMd.replace('## Stem', '## Question'),
  ].join('\n');
}

function seed(bodyMd: string, slug = 'fixture-001'): string {
  return [
    '---',
    `slug: ${slug}`,
    'difficulty: easy',
    'status: draft',
    'tags:',
    '  - {slug: alcohol, name: Alcohol, kind: substance}',
    '  - {slug: general, name: General, kind: topic}',
    ...choices,
    '---',
    bodyMd,
  ].join('\n');
}

function importBody(bodyMd: string, qid = 'fixture-001'): string {
  return convertDraftQuestionToMdx({
    draft: parseDraftQuestionBlock(draft(bodyMd, qid)),
    status: 'draft',
  });
}

const invalidBodies = [
  ['empty stem', body('', explanation), /stem.*empty/i],
  ['blank stem', body(' \t\r\n ', explanation), /stem.*empty/i],
  ['empty explanation', body('Question?', ''), /explanation.*empty/i],
  [
    'blank general explanation',
    body('Question?', ' \t\n### Reference\nCitation.'),
    /explanation.*empty/i,
  ],
  ['missing reference', body('Question?', 'Reason.'), /reference.*required/i],
  [
    'empty reference',
    body('Question?', 'Reason.\n### Reference'),
    /reference.*required/i,
  ],
  [
    'blank reference',
    body('Question?', 'Reason.\n### Reference\n \t'),
    /reference.*required/i,
  ],
  [
    'reversed headings',
    `## Explanation\n${explanation}\n## Stem\nQuestion?`,
    /heading order/i,
  ],
  [
    'nonterminal reference',
    body('Question?', `${explanation}\n## Trailing section\nUnexpected.`),
    /reference.*terminal/i,
  ],
] as const;

describe('import and seed body validation', () => {
  it.each(invalidBodies)('rejects %s during import', (_name, bodyMd, error) => {
    expect(() => importBody(bodyMd)).toThrow(error);
  });

  it.each(invalidBodies)(
    'rejects %s during seed parsing',
    (_name, bodyMd, error) => {
      expect(() => parseSeedQuestionFile(seed(bodyMd))).toThrow(error);
    },
  );

  it('produces the same canonical seed representation from either input format', () => {
    const bodyMd = body('Question?  \r\n', explanation);
    const converted = importBody(bodyMd);
    expect(parseSeedQuestionFile(converted)).toEqual(
      parseSeedQuestionFile(seed(bodyMd)),
    );
    expect(parseSeedQuestionFile(converted)).toMatchObject({
      stem_md: 'Question?',
      explanation_md: 'General explanation.',
      reference_md: 'Synthetic citation.',
    });
  });

  it('requires a reference by default even for a placeholder-named input', () => {
    const raw = seed(body('Question?', 'Reason.'), 'placeholder-test');
    expect(() => parseSeedQuestionFile(raw)).toThrow(/reference.*required/i);
    expect(() =>
      importBody(body('Question?', 'Reason.'), 'placeholder-test'),
    ).toThrow(/reference.*required/i);
  });

  it('permits uncited synthetic placeholders in the dedicated placeholder directory', () => {
    expect(
      parseSeedQuestionFile(
        seed(body('Question?', 'Reason.'), 'placeholder-test'),
        path.resolve('content/questions/placeholder/fixture.mdx'),
      ).reference_md,
    ).toBeNull();
  });

  it('still rejects an empty general explanation in a synthetic placeholder', () => {
    expect(() =>
      parseSeedQuestionFile(
        seed(
          body('Question?', ' \t\n### Reference\nCitation.'),
          'placeholder-test',
        ),
        path.resolve('content/questions/placeholder/fixture.mdx'),
      ),
    ).toThrow(/explanation.*empty/i);
  });

  it.each([
    ['fixture-001', 'content/questions/placeholder/fixture.mdx'],
    ['placeholder-test', 'content/questions/imported/fixture.mdx'],
  ])('requires a reference for %s at %s', (slug, file) => {
    expect(() =>
      parseSeedQuestionFile(
        seed(body('Question?', 'Reason.'), slug),
        path.resolve(file),
      ),
    ).toThrow(/reference.*required/i);
  });
});
