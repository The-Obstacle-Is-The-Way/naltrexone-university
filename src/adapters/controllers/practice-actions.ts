'use server';

// BUG-324: the practice actions a browser calls. A client chooses every
// argument, so each takes only its input; the controller, which also takes
// test dependencies, is not an action.
import * as controller from '@/src/adapters/controllers/practice-controller';

export async function startPracticeSession(input: unknown) {
  return controller.startPracticeSession(input);
}

export async function countAvailableQuestions(input: unknown) {
  return controller.countAvailableQuestions(input);
}

export async function getIncompletePracticeSession(input: unknown) {
  return controller.getIncompletePracticeSession(input);
}

export async function getCompletedSessionQuestionsWithFeedback(input: unknown) {
  return controller.getCompletedSessionQuestionsWithFeedback(input);
}

export async function endPracticeSession(input: unknown) {
  return controller.endPracticeSession(input);
}

export async function discardPracticeSession(input: unknown) {
  return controller.discardPracticeSession(input);
}

export async function finalizeExamAnswers(input: unknown) {
  return controller.finalizeExamAnswers(input);
}

export async function getPracticeSessionReview(input: unknown) {
  return controller.getPracticeSessionReview(input);
}

export async function saveExamDraftAnswer(input: unknown) {
  return controller.saveExamDraftAnswer(input);
}

export async function getPracticeSessionSummary(input: unknown) {
  return controller.getPracticeSessionSummary(input);
}

export async function setPracticeSessionQuestionMark(input: unknown) {
  return controller.setPracticeSessionQuestionMark(input);
}
