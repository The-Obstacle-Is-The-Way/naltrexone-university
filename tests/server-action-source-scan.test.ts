import { describe, expect, it } from 'vitest';
import { scanServerActionSource } from '@/tests/server-action-source-scan';

const scan = (source: string, file = 'app/example/actions.ts') =>
  scanServerActionSource(file, source);

describe('scanServerActionSource', () => {
  it('accepts an action that takes only its input', () => {
    const result = scan(`'use server';
export async function save(formData: FormData) {}
export const remove = async (formData: FormData) => {};
export type { Thing } from './thing';
export type Shape = { a: string };`);

    expect(result).toEqual({
      isServerActionModule: true,
      exportedActions: ['save', 'remove'],
      issues: [],
    });
  });

  it('finds the directive after a leading comment', () => {
    const result = scan(`// The save action.
'use server';
export async function save(formData: FormData, deps: unknown) {}`);

    expect(result.isServerActionModule).toBe(true);
    expect(result.issues).toEqual([
      'app/example/actions.ts:3 save takes 2 parameters',
    ]);
  });

  it.each([
    [
      'a default parameter',
      'export async function save(formData = new FormData()) {}',
      'save has a default parameter',
    ],
    [
      'a rest parameter',
      'export async function save(...args: unknown[]) {}',
      'save has a rest parameter',
    ],
    [
      'a second parameter on an arrow',
      'export const save = async (a: unknown, b: unknown) => {};',
      'save takes 2 parameters',
    ],
    [
      'a value that is not a function',
      'export const save = wrap(inner);',
      'save is not a function declaration',
    ],
    [
      'a re-export',
      "export { save } from './save';",
      're-exports from another module',
    ],
    [
      'a star re-export',
      "export * from './save';",
      're-exports from another module',
    ],
    [
      'a default export',
      'export default async function save() {}',
      'has a default export',
    ],
  ])('rejects %s', (_case, line, issue) => {
    expect(scan(`'use server';\n${line}`).issues).toEqual([
      `app/example/actions.ts:2 ${issue}`,
    ]);
  });

  it('rejects createAction exports, in the controllers too', () => {
    const source = `'use server';
export const getThing = createAction({ schema, getDeps, execute });`;

    expect(
      scanServerActionSource('src/adapters/controllers/thing.ts', source)
        .issues,
    ).toEqual([
      'src/adapters/controllers/thing.ts:2 getThing is not a function declaration',
    ]);
  });

  it("rejects 'use server' inside a function, in any module", () => {
    const result = scan(`export async function Page() {
  async function save(formData: FormData) {
    'use server';
  }
  return save;
}`);

    expect(result).toEqual({
      isServerActionModule: false,
      exportedActions: [],
      issues: ["app/example/actions.ts:2 'use server' inside a function"],
    });
  });

  it('ignores the directive text when it is not a directive', () => {
    const result = scan(`const note = 'use server';
export function helper(a: string, b: string) {}`);

    expect(result).toEqual({
      isServerActionModule: false,
      exportedActions: [],
      issues: [],
    });
  });
});
