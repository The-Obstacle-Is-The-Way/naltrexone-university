'use server';

// BUG-324: the question-feedback actions a browser calls. A client chooses every
// argument, so each takes only its input; the controller, which also takes
// test dependencies, is not an action.
import * as controller from '@/src/adapters/controllers/question-feedback-controller';

export async function rateQuestion(input: unknown) {
  return controller.rateQuestion(input);
}

export async function getQuestionRating(input: unknown) {
  return controller.getQuestionRating(input);
}

export async function submitQuestionReport(input: unknown) {
  return controller.submitQuestionReport(input);
}
