import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';

const require = createRequire(import.meta.url);

// DEBT-460 Cleanup A (issue #813): TypeScript 7 owns the canonical `typescript`
// name and the `tsc` CLI, and every consumer of the classic compiler API loads
// TypeScript 6 explicitly.
describe('TypeScript compiler topology', () => {
  it('declares both compilers under their real names, with no npm: alias', () => {
    const declared: Record<string, string> = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    expect(declared.typescript).toMatch(/^\^?7\./);
    expect(declared['@typescript/typescript6']).toMatch(/^\^?6\./);
    expect(declared['@typescript/native']).toBeUndefined();
    expect(
      Object.entries(declared).filter(([, specifier]) =>
        specifier.startsWith('npm:'),
      ),
    ).toEqual([]);
  });

  it('resolves canonical typescript to TypeScript 7', () => {
    expect(require('typescript/package.json').version).toMatch(/^7\./);
  });

  it('serves the classic compiler API from @typescript/typescript6', () => {
    const ts = require('@typescript/typescript6');

    expect(ts.version).toMatch(/^6\./);
    expect(typeof ts.createSourceFile).toBe('function');
  });

  // Stryker's sandbox preprocessor runs `import('typescript')` and calls the
  // classic API, but declares no dependency, so pnpm packageExtensions gives
  // it TypeScript 6. Without that, it would load TypeScript 7 and fail with
  // `ts.parseConfigFileTextToJson is not a function`.
  it('gives Stryker the TypeScript 6 compiler API', () => {
    const strykerRequire = createRequire(
      require.resolve('@stryker-mutator/core'),
    );
    const ts = strykerRequire('typescript');

    expect(ts.version).toMatch(/^6\./);
    expect(typeof ts.parseConfigFileTextToJson).toBe('function');
  });
});
