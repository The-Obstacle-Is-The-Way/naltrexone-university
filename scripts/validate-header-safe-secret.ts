import { pathToFileURL } from 'node:url';

export type HeaderSecretValidation = {
  name: string;
  present: boolean;
  ok: boolean;
  length: number;
  trimDelta: number;
  leadingWhitespace: boolean;
  trailingWhitespace: boolean;
  internalWhitespace: boolean;
  headerUnsafe: boolean;
  errors: string[];
};

type HeaderSecretValidationOptions = {
  optional?: boolean;
};

function hasHttpHeaderUnsafeControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

export function validateHeaderSecret(
  name: string,
  value: string | undefined,
  options: HeaderSecretValidationOptions = {},
): HeaderSecretValidation {
  if (value === undefined || value === '') {
    return {
      name,
      present: false,
      ok: Boolean(options.optional),
      length: 0,
      trimDelta: 0,
      leadingWhitespace: false,
      trailingWhitespace: false,
      internalWhitespace: false,
      headerUnsafe: false,
      errors: options.optional ? [] : ['is required'],
    };
  }

  const trimmed = value.trim();
  const leadingWhitespace = /^\s/.test(value);
  const trailingWhitespace = /\s$/.test(value);
  const internalWhitespace = /\s/.test(trimmed);
  const headerUnsafe = hasHttpHeaderUnsafeControlCharacter(value);
  const errors: string[] = [];

  if (leadingWhitespace) {
    errors.push('must not contain leading whitespace');
  }
  if (trailingWhitespace) {
    errors.push('must not contain trailing whitespace');
  }
  if (internalWhitespace) {
    errors.push('must not contain internal whitespace');
  }
  if (headerUnsafe) {
    errors.push('must not contain HTTP-header-unsafe control characters');
  }

  return {
    name,
    present: true,
    ok: errors.length === 0,
    length: value.length,
    trimDelta: value.length - trimmed.length,
    leadingWhitespace,
    trailingWhitespace,
    internalWhitespace,
    headerUnsafe,
    errors,
  };
}

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
