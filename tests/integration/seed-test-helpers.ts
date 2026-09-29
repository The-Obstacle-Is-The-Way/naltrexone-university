import type * as schema from '@/db/schema';
import type { QuestionDifficulty } from '@/src/domain/value-objects';

// A seed source file for integration tests, with optional content edits.
export type ContentEdits = {
  difficulty?: QuestionDifficulty;
  stem?: string;
  explanation?: string;
  reference?: string;
  correctText?: string;
  wrongText?: string;
  wrongExplanation?: string;
  labels?: readonly string[];
  correctLabel?: string;
  status?: schema.QuestionStatus;
};

export function source(slug: string, edits: ContentEdits = {}) {
  const choices = (edits.labels ?? ['A', 'B', 'C']).flatMap((label) => {
    const correct = label === (edits.correctLabel ?? 'B');
    const text =
      label === 'B'
        ? (edits.correctText ?? 'Original correct option.')
        : (edits.wrongText ?? `Original option ${label}.`);
    return [
      `  - label: ${label}`,
      `    text: ${JSON.stringify(text)}`,
      `    correct: ${correct}`,
      ...(correct
        ? []
        : [
            `    explanation: ${JSON.stringify(edits.wrongExplanation ?? 'Original wrong-option explanation.')}`,
          ]),
    ];
  });
  return {
    absolutePath: `/tmp/${slug}.mdx`,
    raw: [
      '---',
      `slug: ${slug}`,
      `difficulty: ${edits.difficulty ?? 'easy'}`,
      `status: ${edits.status ?? 'published'}`,
      'tags:',
      '  - {slug: general, name: General, kind: topic}',
      '  - {slug: alcohol, name: Alcohol, kind: substance}',
      'choices:',
      ...choices,
      '---',
      '## Stem',
      edits.stem ?? 'Original clinical task.',
      '## Explanation',
      edits.explanation ?? 'Original general explanation.',
      '### Reference',
      edits.reference ?? 'Original synthetic reference.',
    ].join('\n'),
  };
}
