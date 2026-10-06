'use server';

// BUG-324: the question actions a browser calls. A client chooses every
// argument, so each takes only its input; the controller, which also takes
// test dependencies, is not an action.
import * as controller from '@/src/adapters/controllers/question-controller';

export async function getNextQuestion(input: unknown) {
  return controller.getNextQuestion(input);
}

export async function submitAnswer(input: unknown) {
  return controller.submitAnswer(input);
}
