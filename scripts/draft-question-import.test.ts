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

describe('draft question import', () => {
  it('splits a recall.md file into per-question blocks', () => {
    const raw = [
      '---',
      'qid: demo-001',
      'type: recall',
      'difficulty: easy',
      'substances: [alcohol]',
      'topics: [treatment-pharmacotherapy]',
      'source: demo',
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
      'Because.',
      '',
      '---',
      '',
      '---',
      'qid: demo-002',
      'type: recall',
      'difficulty: medium',
      'substances: [alcohol]',
      'topics: [treatment-pharmacotherapy]',
      'source: demo',
      'answer: A',
      '---',
      '',
      '## Question',
      '',
      'Second question?',
      '',
      '## Choices',
      '',
      '- A) Yep',
      '- B) Nope',
      '',
      '## Explanation',
      '',
      'Because again.',
      '',
      '---',
    ].join('\n');

    const blocks = splitDraftQuestionsFile(raw);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain('qid: demo-001');
    expect(blocks[1]).toContain('qid: demo-002');
  });

  it('converts a draft question block into valid MDX seed content', () => {
    const block = [
      '---',
      'qid: demo-001',
      'type: recall',
      'difficulty: easy',
      'substances: [polysubstance]',
      'topics: [psychosocial-interventions, treatment-pharmacotherapy]',
      'source: demo-source',
      'answer: B',
      '---',
      '',
      '## Question',
      '',
      'What is motivational interviewing?',
      '',
      '## Choices',
      '',
      '- A) A confrontational approach',
      '- B) A collaborative style',
      '- C) A detox protocol',
      '- D) A urine test',
      '',
      '## Explanation',
      '',
      'It is collaborative.',
      '',
      '**Why other answers are wrong:**',
      '- A) Wrong because…',
      '',
      '---',
    ].join('\n');

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
    const block = [
      '---',
      'qid: demo-003',
      'type: recall',
      'difficulty: easy',
      'substances: [opioids]',
      'topics: [treatment-pharmacotherapy]',
      'treatments: [buprenorphine, nrt]',
      'diagnoses: [opioid-use-disorder]',
      'source: demo-source',
      'answer: A',
      '---',
      '',
      '## Question',
      '',
      'Which statement is correct?',
      '',
      '## Choices',
      '',
      '- A) Correct',
      '- B) Incorrect',
      '',
      '## Explanation',
      '',
      'Because.',
      '',
      '---',
    ].join('\n');

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
    const block = [
      '---',
      'qid: demo-004',
      'type: recall',
      'difficulty: easy',
      'substances: [alcohol]',
      'topics: [screening-diagnosis]',
      'source: demo-source',
      'answer: A',
      '---',
      '',
      '## Question',
      '',
      'Question?',
      '',
      '## Choices',
      '',
      '- A) Correct',
      '- B) Incorrect',
      '',
      '## Explanation',
      '',
      'Because.',
      '',
      '---',
    ].join('\n');

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
    const block = [
      '---',
      'qid: demo-005',
      'type: recall',
      'difficulty: easy',
      'substances: [alcohol]',
      'topics: [screening-diagnosis]',
      'treatments: [fake-drug]',
      'source: demo-source',
      'answer: A',
      '---',
      '',
      '## Question',
      '',
      'Question?',
      '',
      '## Choices',
      '',
      '- A) Correct',
      '- B) Incorrect',
      '',
      '## Explanation',
      '',
      'Because.',
      '',
      '---',
    ].join('\n');

    expect(() => parseDraftQuestionBlock(block)).toThrow(/treatment/i);
  });

  it('requires at least one topic', () => {
    const missingTopics = [
      '---',
      'qid: demo-006',
      'type: recall',
      'difficulty: easy',
      'substances: [alcohol]',
      'topics: []',
      'source: demo-source',
      'answer: A',
      '---',
      '',
      '## Question',
      '',
      'Question?',
      '',
      '## Choices',
      '',
      '- A) Correct',
      '- B) Incorrect',
      '',
      '## Explanation',
      '',
      'Because.',
      '',
      '---',
    ].join('\n');
    expect(() => parseDraftQuestionBlock(missingTopics)).toThrow(/topic/i);
  });

  it('requires at least one substance', () => {
    const missingSubstances = [
      '---',
      'qid: demo-007',
      'type: recall',
      'difficulty: easy',
      'substances: []',
      'topics: [screening-diagnosis]',
      'source: demo-source',
      'answer: A',
      '---',
      '',
      '## Question',
      '',
      'Question?',
      '',
      '## Choices',
      '',
      '- A) Correct',
      '- B) Incorrect',
      '',
      '## Explanation',
      '',
      'Because.',
      '',
      '---',
    ].join('\n');
    expect(() => parseDraftQuestionBlock(missingSubstances)).toThrow(
      /substance/i,
    );
  });

  it('applies canonical display names from lookup, not titleCaseFromSlug', () => {
    const block = [
      '---',
      'qid: demo-008',
      'type: recall',
      'difficulty: medium',
      'substances: [alcohol]',
      'topics: [co-occurring-disorders, ethics-legal]',
      'treatments: [nrt]',
      'source: demo-source',
      'answer: C',
      '---',
      '',
      '## Question',
      '',
      'Question?',
      '',
      '## Choices',
      '',
      '- A) Wrong',
      '- B) Wrong',
      '- C) Right',
      '',
      '## Explanation',
      '',
      'Because.',
      '',
      '---',
    ].join('\n');

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
    const block = [
      '---',
      'qid: demo-009',
      'type: recall',
      'difficulty: easy',
      'substances: [alcohol]',
      'topics: [made-up-topic]',
      'source: demo-source',
      'answer: A',
      '---',
      '',
      '## Question',
      '',
      'Question?',
      '',
      '## Choices',
      '',
      '- A) Correct',
      '- B) Incorrect',
      '',
      '## Explanation',
      '',
      'Because.',
      '',
      '---',
    ].join('\n');

    expect(() => parseDraftQuestionBlock(block)).toThrow(/topic/i);
  });

  it('rejects draft blocks that include both answer and choices in frontmatter', () => {
    const block = [
      '---',
      'qid: demo-010',
      'type: recall',
      'difficulty: easy',
      'substances: [alcohol]',
      'topics: [screening-diagnosis]',
      'source: demo-source',
      'answer: A',
      'choices:',
      '  - label: A',
      '    text: "Correct"',
      '    correct: true',
      '  - label: B',
      '    text: "Incorrect"',
      '    correct: false',
      '    explanation: "Because B is wrong."',
      '---',
      '',
      '## Question',
      '',
      'Question?',
      '',
      '## Choices',
      '',
      '- A) Correct',
      '- B) Incorrect',
      '',
      '## Explanation',
      '',
      'Because.',
      '',
      '---',
    ].join('\n');

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
      '## Choices',
      '',
      '- A) Correct',
      '- B) Incorrect',
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
    const block = [
      '---',
      'qid: demo-012',
      'type: recall',
      'difficulty: easy',
      'substances: [alcohol]',
      'topics: [screening-diagnosis]',
      'source: demo-source',
      'choices:',
      '  - label: A',
      '    text: "Correct"',
      '    correct: true',
      '    explanation: "This should not be here."',
      '  - label: B',
      '    text: "Incorrect"',
      '    correct: false',
      '    explanation: "Because B is wrong."',
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

    expect(() => parseDraftQuestionBlock(block)).toThrow(/correct/i);
  });

  it('rejects new-format frontmatter when a wrong choice is missing explanation', () => {
    const block = [
      '---',
      'qid: demo-013',
      'type: recall',
      'difficulty: easy',
      'substances: [alcohol]',
      'topics: [screening-diagnosis]',
      'source: demo-source',
      'choices:',
      '  - label: A',
      '    text: "Correct"',
      '    correct: true',
      '  - label: B',
      '    text: "Incorrect"',
      '    correct: false',
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

    expect(() => parseDraftQuestionBlock(block)).toThrow(/explanation/i);
  });

  it('parses new-format blocks without a ## Choices heading', () => {
    const block = [
      '---',
      'qid: demo-014',
      'type: recall',
      'difficulty: easy',
      'substances: [alcohol]',
      'topics: [screening-diagnosis]',
      'source: demo-source',
      'choices:',
      '  - label: A',
      '    text: "Wrong"',
      '    correct: false',
      '    explanation: "Because A is wrong."',
      '  - label: B',
      '    text: "Right"',
      '    correct: true',
      '---',
      '',
      '## Question',
      '',
      'What is the correct answer?',
      '',
      '## Explanation',
      '',
      'Because it is correct.',
      '',
      '### Reference',
      '',
      'A concise citation.',
      '',
      '---',
    ].join('\n');

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

  it('rejects new-format blocks that still include a ## Choices heading', () => {
    const block = [
      '---',
      'qid: demo-015',
      'type: recall',
      'difficulty: easy',
      'substances: [alcohol]',
      'topics: [screening-diagnosis]',
      'source: demo-source',
      'choices:',
      '  - label: A',
      '    text: "Wrong"',
      '    correct: false',
      '    explanation: "Because A is wrong."',
      '  - label: B',
      '    text: "Right"',
      '    correct: true',
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

    expect(() => parseDraftQuestionBlock(block)).toThrow(/## Choices/i);
  });

  it('continues parsing legacy blocks with markdown choices', () => {
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

    const draft = parseDraftQuestionBlock(block);

    expect(draft.choices).toEqual([
      {
        label: 'A',
        text: 'Wrong',
        correct: false,
      },
      {
        label: 'B',
        text: 'Right',
        correct: true,
      },
    ]);
  });

  it('emits explanation only on wrong choices for new-format draft conversion', () => {
    const block = [
      '---',
      'qid: demo-017',
      'type: recall',
      'difficulty: easy',
      'substances: [alcohol]',
      'topics: [screening-diagnosis]',
      'source: demo-source',
      'choices:',
      '  - label: A',
      '    text: "Wrong"',
      '    correct: false',
      '    explanation: "Because A is wrong."',
      '  - label: B',
      '    text: "Right"',
      '    correct: true',
      '---',
      '',
      '## Question',
      '',
      'What is the correct answer?',
      '',
      '## Explanation',
      '',
      'Because it is correct.',
      '',
      '---',
    ].join('\n');

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

  it('does not emit explanation fields for legacy draft conversion', () => {
    const block = [
      '---',
      'qid: demo-018',
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
      },
      {
        label: 'B',
        text: 'Right',
        correct: true,
      },
    ]);
  });

  it('round-trips a new-format draft into schema-valid MDX frontmatter', () => {
    const block = [
      '---',
      'qid: demo-019',
      'type: recall',
      'difficulty: medium',
      'substances: [alcohol]',
      'topics: [treatment-pharmacotherapy]',
      'source: demo-source',
      'choices:',
      '  - label: A',
      '    text: "Wrong"',
      '    correct: false',
      '    explanation: "Because A is wrong."',
      '  - label: B',
      '    text: "Right"',
      '    correct: true',
      '  - label: C',
      '    text: "Also wrong"',
      '    correct: false',
      '    explanation: "Because C is wrong."',
      '---',
      '',
      '## Question',
      '',
      'What is the correct answer?',
      '',
      '## Explanation',
      '',
      'Because it is correct.',
      '',
      '### Reference',
      '',
      'A concise citation.',
      '',
      '---',
    ].join('\n');

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
