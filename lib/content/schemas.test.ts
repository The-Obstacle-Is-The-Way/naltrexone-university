import { describe, expect, it } from 'vitest';
import { QuestionFrontmatterSchema, TagFrontmatterSchema } from './schemas';

const baseQuestionFrontmatter = {
  slug: 'example-question',
  difficulty: 'easy' as const,
  status: 'draft' as const,
  tags: [
    {
      slug: 'screening-diagnosis',
      name: 'Screening & Diagnosis',
      kind: 'topic' as const,
    },
    {
      slug: 'opioids',
      name: 'Opioids',
      kind: 'substance' as const,
    },
  ],
};

describe('TagFrontmatterSchema', () => {
  it('rejects domain kind', () => {
    const result = TagFrontmatterSchema.safeParse({
      slug: 'screening-diagnosis',
      name: 'Screening & Diagnosis',
      kind: 'domain',
    });

    expect(result.success).toBe(false);
  });

  it('rejects non-canonical topic slug', () => {
    const result = TagFrontmatterSchema.safeParse({
      slug: 'pharmacology',
      name: 'Pharmacology',
      kind: 'topic',
    });

    expect(result.success).toBe(false);
  });

  it('rejects non-canonical substance slug', () => {
    const result = TagFrontmatterSchema.safeParse({
      slug: 'caffeine',
      name: 'Caffeine',
      kind: 'substance',
    });

    expect(result.success).toBe(false);
  });

  it('rejects non-canonical treatment slug', () => {
    const result = TagFrontmatterSchema.safeParse({
      slug: 'aspirin',
      name: 'Aspirin',
      kind: 'treatment',
    });

    expect(result.success).toBe(false);
  });

  it('accepts canonical diagnosis slug without kind-specific validation', () => {
    const result = TagFrontmatterSchema.safeParse({
      slug: 'opioid-use-disorder',
      name: 'Opioid Use Disorder',
      kind: 'diagnosis',
    });

    expect(result.success).toBe(true);
  });
});

describe('QuestionFrontmatterSchema', () => {
  it('rejects duplicate tag slugs', () => {
    const result = QuestionFrontmatterSchema.safeParse({
      slug: 'example-question',
      difficulty: 'easy',
      status: 'draft',
      tags: [
        {
          slug: 'screening-diagnosis',
          name: 'Screening & Diagnosis',
          kind: 'topic',
        },
        { slug: 'opioids', name: 'Opioids', kind: 'substance' },
        { slug: 'opioids', name: 'Opioids', kind: 'substance' },
      ],
      choices: [
        { label: 'A', text: 'A', correct: false },
        { label: 'B', text: 'B', correct: true },
      ],
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Test setup error: expected parse failure');
    }
    expect(result.error.flatten().fieldErrors.tags).toEqual([
      'tag slugs must be unique',
    ]);
  });

  it('requires at least one topic tag', () => {
    const missingTopic = QuestionFrontmatterSchema.safeParse({
      slug: 'question-without-topic',
      difficulty: 'medium',
      status: 'published',
      tags: [{ slug: 'opioids', name: 'Opioids', kind: 'substance' }],
      choices: [
        { label: 'A', text: 'A', correct: false },
        { label: 'B', text: 'B', correct: true },
      ],
    });
    expect(missingTopic.success).toBe(false);
  });

  it('requires at least one substance tag', () => {
    const missingSubstance = QuestionFrontmatterSchema.safeParse({
      slug: 'question-without-substance',
      difficulty: 'medium',
      status: 'published',
      tags: [
        {
          slug: 'screening-diagnosis',
          name: 'Screening & Diagnosis',
          kind: 'topic',
        },
      ],
      choices: [
        { label: 'A', text: 'A', correct: false },
        { label: 'B', text: 'B', correct: true },
      ],
    });
    expect(missingSubstance.success).toBe(false);
  });

  it('rejects explanation on the correct choice', () => {
    const result = QuestionFrontmatterSchema.safeParse({
      ...baseQuestionFrontmatter,
      choices: [
        {
          label: 'A',
          text: 'Incorrect choice',
          correct: false,
          explanation: 'Why A is wrong',
        },
        {
          label: 'B',
          text: 'Correct choice',
          correct: true,
          explanation: 'This should not be allowed',
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('accepts explanation on a wrong choice', () => {
    const result = QuestionFrontmatterSchema.safeParse({
      ...baseQuestionFrontmatter,
      choices: [
        {
          label: 'A',
          text: 'Incorrect choice',
          correct: false,
          explanation: 'Why A is wrong',
        },
        {
          label: 'B',
          text: 'Correct choice',
          correct: true,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects whitespace-only explanation on a wrong choice', () => {
    const result = QuestionFrontmatterSchema.safeParse({
      ...baseQuestionFrontmatter,
      choices: [
        {
          label: 'A',
          text: 'Incorrect choice',
          correct: false,
          explanation: '   ',
        },
        {
          label: 'B',
          text: 'Correct choice',
          correct: true,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('accepts a wrong choice without explanation for legacy compatibility', () => {
    const result = QuestionFrontmatterSchema.safeParse({
      ...baseQuestionFrontmatter,
      choices: [
        {
          label: 'A',
          text: 'Incorrect choice',
          correct: false,
        },
        {
          label: 'B',
          text: 'Correct choice',
          correct: true,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('accepts a correct choice without explanation', () => {
    const result = QuestionFrontmatterSchema.safeParse({
      ...baseQuestionFrontmatter,
      choices: [
        {
          label: 'A',
          text: 'Incorrect choice',
          correct: false,
          explanation: 'Why A is wrong',
        },
        {
          label: 'B',
          text: 'Correct choice',
          correct: true,
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});
