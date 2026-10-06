import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findServerActionModules } from '@/tests/server-action-source-scan';

// BUG-324: a client chooses an action's input, and React can decode server
// functions inside it. So an exported action must never call a member of its
// input; a form action checks that it was given form data first.
function inputThatRecordsCalls() {
  const called: string[] = [];
  const input = new Proxy(
    {},
    {
      get: (_target, key) =>
        typeof key === 'string'
          ? () => {
              called.push(key);
            }
          : undefined,
    },
  );
  return { input, called };
}

const ACTIONS = findServerActionModules().flatMap(({ file, exportedActions }) =>
  exportedActions.map((name) => [`${file} ${name}`, file, name] as const),
);

describe('exported server actions and their input', () => {
  it('finds the exported actions', () => {
    expect(ACTIONS.length).toBe(28);
  });

  it.each(ACTIONS)(
    '%s calls no member of its input',
    async (_label, file, name) => {
      const module: Record<string, (input: unknown) => Promise<unknown>> =
        await import(path.resolve(file));
      const { input, called } = inputThatRecordsCalls();

      const action = module[name];
      expect(action).toBeTypeOf('function');
      await action?.(input).catch(() => undefined);

      expect(called).toEqual([]);
    },
  );
});
