'use server';

// BUG-324: the tag actions a browser calls. A client chooses every
// argument, so each takes only its input; the controller, which also takes
// test dependencies, is not an action.
import * as controller from '@/src/adapters/controllers/tag-controller';

export async function getTags(input: unknown) {
  return controller.getTags(input);
}
