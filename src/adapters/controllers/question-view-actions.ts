'use server';

// BUG-324: the question-view actions a browser calls. A client chooses every
// argument, so each takes only its input; the controller, which also takes
// test dependencies, is not an action.
import * as controller from '@/src/adapters/controllers/question-view-controller';

export async function getQuestionBySlug(input: unknown) {
  return controller.getQuestionBySlug(input);
}

export async function getPreviousAttempt(input: unknown) {
  return controller.getPreviousAttempt(input);
}
