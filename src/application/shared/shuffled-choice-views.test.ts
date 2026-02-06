import { describe, expect, it } from 'vitest';
import { createQuestionSeed, shuffleWithSeed } from '@/src/domain/services';
import { createQuestion } from '@/src/domain/test-helpers';
import { AllChoiceLabels } from '@/src/domain/value-objects';
import { buildShuffledChoiceViews } from './shuffled-choice-views';

describe('buildShuffledChoiceViews', () => {
  it('returns deterministic shuffled choices with display labels and stable sortOrder', () => {
    const question = createQuestion({
      id: 'question-1',
      choices: [
        {
          id: 'choice-b',
          label: 'B',
          textMd: 'Choice B',
          isCorrect: false,
          explanationMd: null,
          sortOrder: 2,
          questionId: 'question-1',
        },
        {
          id: 'choice-a',
          label: 'A',
          textMd: 'Choice A',
          isCorrect: true,
          explanationMd: 'A explanation',
          sortOrder: 1,
          questionId: 'question-1',
        },
        {
          id: 'choice-c',
          label: 'C',
          textMd: 'Choice C',
          isCorrect: false,
          explanationMd: 'C explanation',
          sortOrder: 3,
          questionId: 'question-1',
        },
      ],
    });

    const userId = 'user-1';
    const views = buildShuffledChoiceViews(question, userId);

    const seed = createQuestionSeed(userId, question.id);
    const stableInput = question.choices.slice().sort((a, b) => {
      const bySortOrder = a.sortOrder - b.sortOrder;
      if (bySortOrder !== 0) return bySortOrder;
      return a.id.localeCompare(b.id);
    });
    const shuffled = shuffleWithSeed(stableInput, seed);

    expect(views.map((v) => v.choiceId)).toEqual(shuffled.map((c) => c.id));
    expect(views.map((v) => v.displayLabel)).toEqual(
      shuffled.map((_, index) => AllChoiceLabels[index]),
    );
    expect(views.map((v) => v.sortOrder)).toEqual([1, 2, 3]);
  });

  it('throws INTERNAL_ERROR when question has more choices than available labels', () => {
    const question = createQuestion({
      id: 'question-many',
      choices: [1, 2, 3, 4, 5, 6].map((index) => ({
        id: `choice-${index}`,
        label: 'A',
        textMd: `Choice ${index}`,
        isCorrect: index === 1,
        explanationMd: null,
        sortOrder: index,
        questionId: 'question-many',
      })),
    });

    expect(() => buildShuffledChoiceViews(question, 'user-1')).toThrow(
      'has too many choices',
    );
  });
});
