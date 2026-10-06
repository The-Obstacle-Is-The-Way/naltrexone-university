'use server';

// BUG-324: the bookmark actions a browser calls. A client chooses every
// argument, so each takes only its input; the controller, which also takes
// test dependencies, is not an action.
import * as controller from '@/src/adapters/controllers/bookmark-controller';

export async function setBookmark(input: unknown) {
  return controller.setBookmark(input);
}

export async function getBookmarkQuestionIds(input: unknown) {
  return controller.getBookmarkQuestionIds(input);
}

export async function getBookmarkStatus(input: unknown) {
  return controller.getBookmarkStatus(input);
}
