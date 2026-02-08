import { describe, expect, it } from 'vitest';
import { createQuestionSeed, shuffleWithSeed } from '@/src/domain/services';
import { createQuestion } from '@/src/domain/test-helpers';
import { AllChoiceLabels } from '@/src/domain/value-objects';
import { ApplicationError } from '../errors';
import { buildShuffledChoiceViews } from './shuffled-choice-views';

describe('buildShuffledChoiceViews', () => {
  it('returns deterministic output for the same user and question', () => {
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
    const firstViews = buildShuffledChoiceViews(question, userId);
    const secondViews = buildShuffledChoiceViews(question, userId);

    const seed = createQuestionSeed(userId, question.id);
    const stableInput = question.choices.slice().sort((a, b) => {
      const bySortOrder = a.sortOrder - b.sortOrder;
      if (bySortOrder !== 0) return bySortOrder;
      return a.id.localeCompare(b.id);
    });
    const shuffled = shuffleWithSeed(stableInput, seed);

    expect(firstViews).toEqual(secondViews);
    expect(firstViews.map((v) => v.choiceId)).toEqual(
      shuffled.map((c) => c.id),
    );
    expect(firstViews.map((v) => v.displayLabel)).toEqual(
      shuffled.map((_, index) => AllChoiceLabels[index]),
    );
    expect(firstViews.map((v) => v.sortOrder)).toEqual([1, 2, 3]);
  });

  it('uses the userId in the shuffle seed', () => {
    const question = createQuestion({
      id: 'question-1',
      choices: [
        {
          id: 'choice-a',
          label: 'A',
          textMd: 'Choice A',
          isCorrect: true,
          explanationMd: null,
          sortOrder: 1,
          questionId: 'question-1',
        },
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
          id: 'choice-c',
          label: 'C',
          textMd: 'Choice C',
          isCorrect: false,
          explanationMd: null,
          sortOrder: 3,
          questionId: 'question-1',
        },
        {
          id: 'choice-d',
          label: 'D',
          textMd: 'Choice D',
          isCorrect: false,
          explanationMd: null,
          sortOrder: 4,
          questionId: 'question-1',
        },
        {
          id: 'choice-e',
          label: 'E',
          textMd: 'Choice E',
          isCorrect: false,
          explanationMd: null,
          sortOrder: 5,
          questionId: 'question-1',
        },
      ],
    });

    const baseline = buildShuffledChoiceViews(question, 'user-1').map(
      (choice) => choice.choiceId,
    );

    let foundDifferent = false;
    for (let i = 2; i <= 250; i += 1) {
      const candidate = buildShuffledChoiceViews(question, `user-${i}`).map(
        (choice) => choice.choiceId,
      );
      if (candidate.some((id, index) => id !== baseline[index])) {
        foundDifferent = true;
        break;
      }
    }

    expect(foundDifferent).toBe(true);
  });

  it('applies stable id tiebreak sorting before shuffling tied choices', () => {
    const question = createQuestion({
      id: 'question-ties',
      choices: [
        {
          id: 'choice-c',
          label: 'C',
          textMd: 'Choice C',
          isCorrect: false,
          explanationMd: null,
          sortOrder: 1,
          questionId: 'question-ties',
        },
        {
          id: 'choice-a',
          label: 'A',
          textMd: 'Choice A',
          isCorrect: true,
          explanationMd: 'Correct',
          sortOrder: 1,
          questionId: 'question-ties',
        },
        {
          id: 'choice-b',
          label: 'B',
          textMd: 'Choice B',
          isCorrect: false,
          explanationMd: null,
          sortOrder: 1,
          questionId: 'question-ties',
        },
        {
          id: 'choice-d',
          label: 'D',
          textMd: 'Choice D',
          isCorrect: false,
          explanationMd: null,
          sortOrder: 2,
          questionId: 'question-ties',
        },
      ],
    });
    const userId = 'user-1';
    const stableInput = question.choices.slice().sort((a, b) => {
      const bySortOrder = a.sortOrder - b.sortOrder;
      if (bySortOrder !== 0) return bySortOrder;
      return a.id.localeCompare(b.id);
    });
    const expectedIds = shuffleWithSeed(
      stableInput,
      createQuestionSeed(userId, question.id),
    ).map((choice) => choice.id);

    const views = buildShuffledChoiceViews(question, userId);

    expect(views.map((choice) => choice.choiceId)).toEqual(expectedIds);
    expect(views[0]).toMatchObject({
      choiceId: expect.any(String),
      displayLabel: expect.any(String),
      textMd: expect.any(String),
      sortOrder: expect.any(Number),
      isCorrect: expect.any(Boolean),
    });
    expect(views[0]).toHaveProperty('explanationMd');
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

    let thrown: unknown = null;
    expect(() => {
      try {
        buildShuffledChoiceViews(question, 'user-1');
      } catch (error) {
        thrown = error;
        throw error;
      }
    }).toThrow(ApplicationError);
    expect((thrown as ApplicationError).code).toBe('INTERNAL_ERROR');
  });
});
