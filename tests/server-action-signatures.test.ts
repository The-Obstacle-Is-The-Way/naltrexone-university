import { describe, expect, it } from 'vitest';
import {
  findServerActionModules,
  scanServerActionFiles,
} from '@/tests/server-action-source-scan';

// BUG-324: a client can call an exported server action with any arguments it
// likes. So every export of a 'use server' module takes only its input, and a
// test injects dependencies through the logic module the action calls.
describe('server action signatures', () => {
  it('finds the server action modules in app and the controllers', () => {
    const files = findServerActionModules().map(({ file }) => file);

    expect(files.filter((file) => file.startsWith('app/')).length).toBe(5);
    expect(
      files.filter((file) => file.startsWith('src/adapters/controllers/')),
    ).toEqual([
      'src/adapters/controllers/bookmark-actions.ts',
      'src/adapters/controllers/practice-actions.ts',
      'src/adapters/controllers/question-actions.ts',
      'src/adapters/controllers/question-feedback-actions.ts',
      'src/adapters/controllers/question-view-actions.ts',
      'src/adapters/controllers/tag-actions.ts',
    ]);
  });

  it('every export takes at most its input, and no function declares its own action', () => {
    expect(scanServerActionFiles().flatMap(({ issues }) => issues)).toEqual([]);
  });
});
