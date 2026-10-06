import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// A client can call an exported server action with any arguments it likes.
// So an app-level action takes only its input, and a test injects its
// dependencies through the logic module the action calls.
const SERVER_ACTION_MODULES = globSync('app/**/*.ts')
  .filter((file) => !/\.(test|spec)\.ts$/.test(file))
  .filter((file) => /^\s*['"]use server['"]/.test(readFileSync(file, 'utf8')));

describe('app-level server actions', () => {
  it('finds the server action modules', () => {
    expect(SERVER_ACTION_MODULES.length).toBeGreaterThanOrEqual(5);
  });

  it.each(SERVER_ACTION_MODULES)(
    'every export of %s takes at most one parameter',
    async (file) => {
      const module: Record<string, unknown> = await import(path.resolve(file));
      const exported = Object.entries(module).filter(
        ([, value]) => typeof value === 'function',
      );

      expect(exported.length).toBeGreaterThan(0);
      for (const [name, action] of exported)
        expect({ name, length: (action as () => unknown).length }).toEqual({
          name,
          length: expect.toSatisfy((length: number) => length <= 1),
        });
    },
  );
});
