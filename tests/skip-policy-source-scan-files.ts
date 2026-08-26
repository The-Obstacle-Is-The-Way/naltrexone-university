import { readFileSync } from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';

export type SkipPolicySourceFile = {
  filePath: string;
  contents: string;
};

type SourceReader = (filePath: string, encoding: 'utf8') => string;

const SOURCE_GLOBS = [
  '*.{test,spec}.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
  'tests/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
  'scripts/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
  'src/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
  'app/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
  'components/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
  'lib/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
];

export class SkipPolicyScanError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SkipPolicyScanError';
  }
}

export function readSkipPolicySources(
  filePaths: readonly string[],
  readSource: SourceReader = readFileSync,
): SkipPolicySourceFile[] {
  if (filePaths.length === 0) {
    throw new SkipPolicyScanError('SKIP_POLICY_SOURCE_WALK_EMPTY');
  }

  return [...filePaths].sort().map((filePath) => {
    try {
      return {
        filePath,
        contents: readSource(path.resolve(process.cwd(), filePath), 'utf8'),
      };
    } catch (error) {
      throw new SkipPolicyScanError(
        `SKIP_POLICY_SOURCE_UNREADABLE: ${filePath}`,
        { cause: error },
      );
    }
  });
}

export function readRepositorySkipPolicySources(): SkipPolicySourceFile[] {
  const filePaths = fg.sync(SOURCE_GLOBS, {
    cwd: process.cwd(),
    ignore: ['**/node_modules/**', '**/.next/**'],
    onlyFiles: true,
    unique: true,
  });
  return readSkipPolicySources(filePaths);
}
