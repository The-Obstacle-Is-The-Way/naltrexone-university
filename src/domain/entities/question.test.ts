import { describe, expect, it } from 'vitest';
import type { Question } from './question';

describe('Question entity', () => {
  it('has stem and explanation as markdown strings', () => {
    const question: Question = {
      id: 'q-123',
      slug: 'buprenorphine-induction',
      stemMd: '**What** is the answer?',
      explanationMd: 'The answer is B because...',
      difficulty: 'medium',
      status: 'published',
      choices: [],
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(question.stemMd).toContain('**What**');
    expect(question.status).toBe('published');
  });
});
