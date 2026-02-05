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
      'topics: [treatment]',
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
      'topics: [treatment]',
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
      'topics: [psychotherapy, treatment]',
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
      domainTagSlug: 'cochrane',
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
    expect(stemMd).toContain('motivational interviewing');
    expect(explanationMd).toContain('collaborative');

    FullQuestionSchema.parse({ frontmatter, stemMd, explanationMd });
  });
});
