import { describe, expect, it } from 'vitest';
import { QuestionFrontmatterSchema } from './schemas';

describe('QuestionFrontmatterSchema', () => {
  it('rejects duplicate tag slugs', () => {
    const result = QuestionFrontmatterSchema.safeParse({
      slug: 'example-question',
      difficulty: 'easy',
      status: 'draft',
      tags: [
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
});
