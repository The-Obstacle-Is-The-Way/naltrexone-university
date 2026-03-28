import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';
import { parseMdxQuestionBody } from '../lib/content/parseMdxQuestion';
import {
  FullQuestionSchema,
  QuestionFrontmatterSchema,
} from '../lib/content/schemas';
import {
  convertDraftQuestionToMdx,
  parseDraftQuestionBlock,
  splitDraftQuestionsFile,
} from './draft-question-import';

type ChoiceFixture = {
  label: 'A' | 'B' | 'C' | 'D' | 'E';
  text: string;
  correct: boolean;
  explanation?: string;
};

function buildDraftBlock(input: {
  qid: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  substances?: string[];
  topics?: string[];
  treatments?: string[];
  diagnoses?: string[];
  source?: string;
  choices: ChoiceFixture[];
  stem?: string;
  explanation?: string;
  extraFrontmatterLines?: string[];
  extraBodyLines?: string[];
}): string {
  const {
    qid,
    difficulty = 'easy',
    substances = ['alcohol'],
    topics = ['screening-diagnosis'],
    treatments = [],
    diagnoses = [],
    source = 'demo-source',
    choices,
    stem = 'Question?',
    explanation = 'Because.',
    extraFrontmatterLines = [],
    extraBodyLines = [],
  } = input;

  const lines = [
    '---',
    `qid: ${qid}`,
    'type: recall',
    `difficulty: ${difficulty}`,
    `substances: [${substances.join(', ')}]`,
    `topics: [${topics.join(', ')}]`,
    `treatments: [${treatments.join(', ')}]`,
    `diagnoses: [${diagnoses.join(', ')}]`,
    `source: ${source}`,
    ...extraFrontmatterLines,
    'choices:',
  ];

  for (const choice of choices) {
    lines.push(`  - label: ${choice.label}`);
    lines.push(`    text: ${JSON.stringify(choice.text)}`);
    lines.push(`    correct: ${choice.correct ? 'true' : 'false'}`);
    if (choice.explanation !== undefined) {
      lines.push(`    explanation: ${JSON.stringify(choice.explanation)}`);
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## Question');
  lines.push('');
  lines.push(stem);
  lines.push('');
  lines.push('## Explanation');
  lines.push('');
  lines.push(explanation);
  if (extraBodyLines.length > 0) {
    lines.push('');
    lines.push(...extraBodyLines);
  }
  lines.push('');
  lines.push('---');

  return lines.join('\n');
}

describe('draft question import', () => {
  it('splits a recall.md file into per-question blocks', () => {
    const raw = [
      buildDraftBlock({
        qid: 'demo-001',
        choices: [
          {
            label: 'A',
            text: 'Wrong',
            correct: false,
            explanation: 'Because A is wrong.',
          },
          { label: 'B', text: 'Right', correct: true },
        ],
        stem: 'What is the correct answer?',
      }),
      buildDraftBlock({
        qid: 'demo-002',
        difficulty: 'medium',
        choices: [
          { label: 'A', text: 'Yep', correct: true },
          {
            label: 'B',
            text: 'Nope',
            correct: false,
            explanation: 'Because B is wrong.',
          },
        ],
        stem: 'Second question?',
        explanation: 'Because again.',
      }),
    ].join('\n\n');

    const blocks = splitDraftQuestionsFile(raw);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain('qid: demo-001');
    expect(blocks[1]).toContain('qid: demo-002');
  });

  it('converts a new-format draft question block into valid MDX seed content', () => {
    const block = buildDraftBlock({
      qid: 'demo-001',
      substances: ['polysubstance'],
      topics: ['psychosocial-interventions', 'treatment-pharmacotherapy'],
      choices: [
        {
          label: 'A',
          text: 'A confrontational approach',
          correct: false,
          explanation: 'Wrong because it is not collaborative.',
        },
        { label: 'B', text: 'A collaborative style', correct: true },
        {
          label: 'C',
          text: 'A detox protocol',
          correct: false,
          explanation: 'Detox is not the same as motivational interviewing.',
        },
        {
          label: 'D',
          text: 'A urine test',
          correct: false,
          explanation: 'A laboratory test is not a counseling style.',
        },
      ],
      stem: 'What is motivational interviewing?',
      explanation: 'It is collaborative.',
    });

    const draft = parseDraftQuestionBlock(block);
    const mdx = convertDraftQuestionToMdx({
      draft,
      status: 'draft',
    });

    const { data, content } = matter(mdx);
    const frontmatter = QuestionFrontmatterSchema.parse(data);
    const { stemMd, explanationMd } = parseMdxQuestionBody(content);

    expect(frontmatter.slug).toBe('demo-001');
    expect(frontmatter.difficulty).toBe('easy');
    expect(frontmatter.status).toBe('draft');
    expect(frontmatter.choices.find((c) => c.label === 'B')?.correct).toBe(
      true,
    );
    expect(frontmatter.tags.map((tag) => tag.kind)).not.toContain('domain');
    expect(stemMd).toContain('motivational interviewing');
    expect(explanationMd).toContain('collaborative');

    FullQuestionSchema.parse({ frontmatter, stemMd, explanationMd });
  });

  it('maps draft treatments and diagnoses to the corresponding MDX tag kinds', () => {
    const block = buildDraftBlock({
      qid: 'demo-003',
      substances: ['opioids'],
      topics: ['treatment-pharmacotherapy'],
      treatments: ['buprenorphine', 'nrt'],
      diagnoses: ['opioid-use-disorder'],
      choices: [
        { label: 'A', text: 'Correct', correct: true },
        {
          label: 'B',
          text: 'Incorrect',
          correct: false,
          explanation: 'Because B is wrong.',
        },
      ],
      stem: 'Which statement is correct?',
    });

    const draft = parseDraftQuestionBlock(block);
    const mdx = convertDraftQuestionToMdx({
      draft,
      status: 'draft',
    });

    const { data } = matter(mdx);
    const frontmatter = QuestionFrontmatterSchema.parse(data);

    expect(frontmatter.tags.map((tag) => tag.kind)).not.toContain('domain');
    expect(frontmatter.tags).toEqual(
      expect.arrayContaining([
        { slug: 'opioids', name: 'Opioids', kind: 'substance' },
        {
          slug: 'treatment-pharmacotherapy',
          name: 'Treatment & Pharmacotherapy',
          kind: 'topic',
        },
        { slug: 'buprenorphine', name: 'Buprenorphine', kind: 'treatment' },
        { slug: 'nrt', name: 'NRT', kind: 'treatment' },
        {
          slug: 'opioid-use-disorder',
          name: 'Opioid Use Disorder',
          kind: 'diagnosis',
        },
      ]),
    );
  });

  it('does not emit domain tags during draft conversion', () => {
    const block = buildDraftBlock({
      qid: 'demo-004',
      choices: [
        { label: 'A', text: 'Correct', correct: true },
        {
          label: 'B',
          text: 'Incorrect',
          correct: false,
          explanation: 'Because B is wrong.',
        },
      ],
    });

    const draft = parseDraftQuestionBlock(block);
    const mdx = convertDraftQuestionToMdx({
      draft,
      status: 'draft',
    });

    const { data } = matter(mdx);
    const frontmatter = QuestionFrontmatterSchema.parse(data);
    expect(frontmatter.tags.map((tag) => tag.kind)).not.toContain('domain');
    expect(new Set(frontmatter.tags.map((tag) => tag.kind))).toEqual(
      new Set(['substance', 'topic']),
    );
  });

  it('rejects non-canonical treatment slugs', () => {
    const block = buildDraftBlock({
      qid: 'demo-005',
      treatments: ['fake-drug'],
      choices: [
        { label: 'A', text: 'Correct', correct: true },
        {
          label: 'B',
          text: 'Incorrect',
          correct: false,
          explanation: 'Because B is wrong.',
        },
      ],
    });

    expect(() => parseDraftQuestionBlock(block)).toThrow(/treatment/i);
  });

  it('requires at least one topic', () => {
    const block = buildDraftBlock({
      qid: 'demo-006',
      topics: [],
      choices: [
        { label: 'A', text: 'Correct', correct: true },
        {
          label: 'B',
          text: 'Incorrect',
          correct: false,
          explanation: 'Because B is wrong.',
        },
      ],
    });

    expect(() => parseDraftQuestionBlock(block)).toThrow(/topic/i);
  });

  it('requires at least one substance', () => {
    const block = buildDraftBlock({
      qid: 'demo-007',
      substances: [],
      choices: [
        { label: 'A', text: 'Correct', correct: true },
        {
          label: 'B',
          text: 'Incorrect',
          correct: false,
          explanation: 'Because B is wrong.',
        },
      ],
    });

    expect(() => parseDraftQuestionBlock(block)).toThrow(/substance/i);
  });

  it('applies canonical display names from lookup, not titleCaseFromSlug', () => {
    const block = buildDraftBlock({
      qid: 'demo-008',
      difficulty: 'medium',
      topics: ['co-occurring-disorders', 'ethics-legal'],
      treatments: ['nrt'],
      choices: [
        {
          label: 'A',
          text: 'Wrong',
          correct: false,
          explanation: 'Because A is wrong.',
        },
        {
          label: 'B',
          text: 'Wrong',
          correct: false,
          explanation: 'Because B is wrong.',
        },
        { label: 'C', text: 'Right', correct: true },
      ],
    });

    const draft = parseDraftQuestionBlock(block);
    const mdx = convertDraftQuestionToMdx({
      draft,
      status: 'published',
    });
    const { data } = matter(mdx);
    const frontmatter = QuestionFrontmatterSchema.parse(data);

    expect(frontmatter.tags).toEqual(
      expect.arrayContaining([
        {
          slug: 'co-occurring-disorders',
          name: 'Co-occurring Disorders',
          kind: 'topic',
        },
        { slug: 'ethics-legal', name: 'Ethics & Legal', kind: 'topic' },
        { slug: 'nrt', name: 'NRT', kind: 'treatment' },
      ]),
    );
  });

  it('rejects non-canonical topic slugs to prevent tag fragmentation', () => {
    const block = buildDraftBlock({
      qid: 'demo-009',
      topics: ['made-up-topic'],
      choices: [
        { label: 'A', text: 'Correct', correct: true },
        {
          label: 'B',
          text: 'Incorrect',
          correct: false,
          explanation: 'Because B is wrong.',
        },
      ],
    });

    expect(() => parseDraftQuestionBlock(block)).toThrow(/topic/i);
  });

  it('rejects draft blocks that include both answer and choices in frontmatter', () => {
    const block = buildDraftBlock({
      qid: 'demo-010',
      extraFrontmatterLines: ['answer: A'],
      choices: [
        { label: 'A', text: 'Correct', correct: true },
        {
          label: 'B',
          text: 'Incorrect',
          correct: false,
          explanation: 'Because B is wrong.',
        },
      ],
    });

    expect(() => parseDraftQuestionBlock(block)).toThrow();
  });

  it('rejects draft blocks that define neither answer nor choices in frontmatter', () => {
    const block = [
      '---',
      'qid: demo-011',
      'type: recall',
      'difficulty: easy',
      'substances: [alcohol]',
      'topics: [screening-diagnosis]',
      'source: demo-source',
      '---',
      '',
      '## Question',
      '',
      'Question?',
      '',
      '## Explanation',
      '',
      'Because.',
      '',
      '---',
    ].join('\n');

    expect(() => parseDraftQuestionBlock(block)).toThrow();
  });

  it('rejects new-format frontmatter when the correct choice includes explanation', () => {
    const block = buildDraftBlock({
      qid: 'demo-012',
      choices: [
        {
          label: 'A',
          text: 'Correct',
          correct: true,
          explanation: 'This should not be here.',
        },
        {
          label: 'B',
          text: 'Incorrect',
          correct: false,
          explanation: 'Because B is wrong.',
        },
      ],
    });

    expect(() => parseDraftQuestionBlock(block)).toThrow(/correct/i);
  });

  it('rejects new-format frontmatter when a wrong choice is missing explanation', () => {
    const block = buildDraftBlock({
      qid: 'demo-013',
      choices: [
        { label: 'A', text: 'Correct', correct: true },
        { label: 'B', text: 'Incorrect', correct: false },
      ],
    });

    expect(() => parseDraftQuestionBlock(block)).toThrow(/explanation/i);
  });

  it('rejects new-format frontmatter when a wrong choice explanation is whitespace-only', () => {
    const block = buildDraftBlock({
      qid: 'demo-013b',
      choices: [
        { label: 'A', text: 'Correct', correct: true },
        {
          label: 'B',
          text: 'Incorrect',
          correct: false,
          explanation: '   ',
        },
      ],
    });

    expect(() => parseDraftQuestionBlock(block)).toThrow(/explanation/i);
  });

  it('parses new-format blocks without a ## Choices heading', () => {
    const block = buildDraftBlock({
      qid: 'demo-014',
      choices: [
        {
          label: 'A',
          text: 'Wrong',
          correct: false,
          explanation: 'Because A is wrong.',
        },
        { label: 'B', text: 'Right', correct: true },
      ],
      stem: 'What is the correct answer?',
      explanation: 'Because it is correct.',
      extraBodyLines: ['### Reference', '', 'A concise citation.'],
    });

    const draft = parseDraftQuestionBlock(block);

    expect(draft.stemMd).toBe('What is the correct answer?');
    expect(draft.explanationMd).toBe(
      [
        'Because it is correct.',
        '',
        '### Reference',
        '',
        'A concise citation.',
      ].join('\n'),
    );
    expect(draft.choices).toEqual([
      {
        label: 'A',
        text: 'Wrong',
        correct: false,
        explanation: 'Because A is wrong.',
      },
      {
        label: 'B',
        text: 'Right',
        correct: true,
      },
    ]);
  });

  it('rejects new-format blocks that still include a ## Choices heading in the body', () => {
    const block = buildDraftBlock({
      qid: 'demo-014b',
      choices: [
        {
          label: 'A',
          text: 'Wrong',
          correct: false,
          explanation: 'Because A is wrong.',
        },
        { label: 'B', text: 'Right', correct: true },
      ],
      stem: 'What is the correct answer?',
      explanation: 'Because it is correct.',
      extraBodyLines: ['## Choices', '', '- A) Wrong', '- B) Right'],
    });

    expect(() => parseDraftQuestionBlock(block)).toThrow(/## Choices/i);
  });

  it('rejects legacy blocks that still use answer frontmatter and markdown choices', () => {
    const block = [
      '---',
      'qid: demo-016',
      'type: recall',
      'difficulty: easy',
      'substances: [alcohol]',
      'topics: [screening-diagnosis]',
      'source: demo-source',
      'answer: B',
      '---',
      '',
      '## Question',
      '',
      'What is the correct answer?',
      '',
      '## Choices',
      '',
      '- A) Wrong',
      '- B) Right',
      '',
      '## Explanation',
      '',
      'Because it is correct.',
      '',
      '---',
    ].join('\n');

    expect(() => parseDraftQuestionBlock(block)).toThrow();
  });

  it('emits explanation only on wrong choices for new-format draft conversion', () => {
    const block = buildDraftBlock({
      qid: 'demo-017',
      choices: [
        {
          label: 'A',
          text: 'Wrong',
          correct: false,
          explanation: 'Because A is wrong.',
        },
        { label: 'B', text: 'Right', correct: true },
      ],
      stem: 'What is the correct answer?',
      explanation: 'Because it is correct.',
    });

    const draft = parseDraftQuestionBlock(block);
    const mdx = convertDraftQuestionToMdx({
      draft,
      status: 'published',
    });

    const { data } = matter(mdx);
    const frontmatter = QuestionFrontmatterSchema.parse(data);

    expect(frontmatter.choices).toEqual([
      {
        label: 'A',
        text: 'Wrong',
        correct: false,
        explanation: 'Because A is wrong.',
      },
      {
        label: 'B',
        text: 'Right',
        correct: true,
      },
    ]);
  });

  it('round-trips a new-format draft into schema-valid MDX frontmatter', () => {
    const block = buildDraftBlock({
      qid: 'demo-019',
      difficulty: 'medium',
      topics: ['treatment-pharmacotherapy'],
      choices: [
        {
          label: 'A',
          text: 'Wrong',
          correct: false,
          explanation: 'Because A is wrong.',
        },
        { label: 'B', text: 'Right', correct: true },
        {
          label: 'C',
          text: 'Also wrong',
          correct: false,
          explanation: 'Because C is wrong.',
        },
      ],
      stem: 'What is the correct answer?',
      explanation: 'Because it is correct.',
      extraBodyLines: ['### Reference', '', 'A concise citation.'],
    });

    const draft = parseDraftQuestionBlock(block);
    const mdx = convertDraftQuestionToMdx({
      draft,
      status: 'draft',
    });

    const { data, content } = matter(mdx);
    const frontmatter = QuestionFrontmatterSchema.parse(data);
    const { stemMd, explanationMd } = parseMdxQuestionBody(content);

    expect(frontmatter.choices).toEqual([
      {
        label: 'A',
        text: 'Wrong',
        correct: false,
        explanation: 'Because A is wrong.',
      },
      {
        label: 'B',
        text: 'Right',
        correct: true,
      },
      {
        label: 'C',
        text: 'Also wrong',
        correct: false,
        explanation: 'Because C is wrong.',
      },
    ]);
    expect(stemMd).toBe('What is the correct answer?');
    expect(explanationMd).toBe(
      [
        'Because it is correct.',
        '',
        '### Reference',
        '',
        'A concise citation.',
      ].join('\n'),
    );
    FullQuestionSchema.parse({ frontmatter, stemMd, explanationMd });
  });
});
