import { describe, expect, it } from 'vitest';
import { createChoice, createQuestion } from '../test-helpers';
import { gradeAnswer } from './grading';

describe('gradeAnswer', () => {
  it('returns isCorrect=true when correct choice selected', () => {
    const questionId = 'q1';
    const choices = [
      createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
      createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
      createChoice({ id: 'c3', questionId, label: 'C', isCorrect: false }),
    ];
    const question = createQuestion({ id: questionId, choices });

    const result = gradeAnswer(question, 'c2');
    expect(result).toEqual({
      isCorrect: true,
      correctChoiceId: 'c2',
      correctLabel: 'B',
    });
  });

  it('returns isCorrect=false when incorrect choice selected', () => {
    const questionId = 'q1';
    const choices = [
      createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
      createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
    ];
    const question = createQuestion({ id: questionId, choices });

    const result = gradeAnswer(question, 'c1');
    expect(result.isCorrect).toBe(false);
    expect(result.correctChoiceId).toBe('c2');
    expect(result.correctLabel).toBe('B');
  });

  it('throws if no correct choice exists', () => {
    const questionId = 'q1';
    const choices = [
      createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
      createChoice({ id: 'c2', questionId, label: 'B', isCorrect: false }),
    ];
    const question = createQuestion({ id: questionId, choices });

    expect(() => gradeAnswer(question, 'c1')).toThrow();
  });

  it('throws if multiple correct choices exist', () => {
    const questionId = 'q1';
    const choices = [
      createChoice({ id: 'c1', questionId, label: 'A', isCorrect: true }),
      createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
    ];
    const question = createQuestion({ id: questionId, choices });

    expect(() => gradeAnswer(question, 'c1')).toThrow();
  });

  it('throws if selected choice not found', () => {
    const questionId = 'q1';
    const choices = [createChoice({ id: 'c1', questionId, label: 'A' })];
    const question = createQuestion({ id: questionId, choices });

    expect(() => gradeAnswer(question, 'missing')).toThrow();
  });
});
