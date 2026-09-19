import { pathToFileURL } from 'node:url';
import {
  type HeaderSecretValidation,
  validateHeaderSecret,
} from '@/src/adapters/shared/header-secret';

export {
  type HeaderSecretValidation,
  validateHeaderSecret,
} from '@/src/adapters/shared/header-secret';

export function formatHeaderSecretValidation(
  result: HeaderSecretValidation,
): string {
  const base = `${result.name}: ${result.ok ? 'PASS' : 'FAIL'} present=${result.present} length=${result.length} trim_delta=${result.trimDelta} leading_ws=${result.leadingWhitespace} trailing_ws=${result.trailingWhitespace} internal_ws=${result.internalWhitespace} header_unsafe=${result.headerUnsafe}`;
  if (result.errors.length === 0) return base;
  return `${base} errors=${result.errors.join('; ')}`;
}

export function runValidateHeaderSafeSecret(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
  stdout: Pick<NodeJS.WriteStream, 'write'> = process.stdout,
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr,
): number {
  const optional = argv.includes('--optional');
  const names = argv.filter((arg) => arg !== '--optional');

  if (names.length === 0) {
    stderr.write(
      'Usage: tsx scripts/validate-header-safe-secret.ts SECRET_NAME [SECRET_NAME...] [--optional]\n',
    );
    return 1;
  }

  const results = names.map((name) =>
    validateHeaderSecret(name, env[name], { optional }),
  );

  for (const result of results) {
    const output = `${formatHeaderSecretValidation(result)}\n`;
    if (result.ok) {
      stdout.write(output);
    } else {
      stderr.write(output);
    }
  }

  return results.every((result) => result.ok) ? 0 : 1;
}

/* v8 ignore start -- direct-invocation CLI entrypoint, exercised via runValidateHeaderSafeSecret in tests */
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = runValidateHeaderSafeSecret(process.argv.slice(2));
}
/* v8 ignore stop */
