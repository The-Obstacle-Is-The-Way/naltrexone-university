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

function hasHttpHeaderUnsafeCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    // Fetch headers are ByteStrings; code units above 255 cannot be encoded.
    if (code <= 31 || code === 127 || code > 255) return true;
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
  const headerUnsafe = hasHttpHeaderUnsafeCharacter(value);
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
