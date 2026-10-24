import { realpathSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Node resolves symlinks, and tsx can resolve an omitted extension or a .js
// spelling of a .ts file. Compare the same real files; importing a command
// never makes it the entry point.
export function isMain(
  moduleUrl: string,
  entryPath = process.argv[1],
): boolean {
  if (!entryPath) return false;
  const modulePath = fileURLToPath(moduleUrl);
  const moduleRealPath = realpathSync(modulePath);
  const extension = extname(modulePath);
  for (const candidate of [
    entryPath,
    `${entryPath}${extension}`,
    entryPath.replace(/\.[cm]?jsx?$/, extension),
  ]) {
    try {
      return realpathSync(resolve(candidate)) === moduleRealPath;
    } catch (error) {
      // The runtime may have resolved an omitted extension. Only a missing
      // candidate is a fallback; permission and filesystem failures surface.
      if (
        !(
          error instanceof Error &&
          'code' in error &&
          (error.code === 'ENOENT' || error.code === 'ENOTDIR')
        )
      )
        throw error;
    }
  }
  return false;
}
