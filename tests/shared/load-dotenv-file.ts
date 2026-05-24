import { config } from 'dotenv';

export function loadDotenvFileOrThrow(
  path: string,
  options?: { override?: boolean },
): void {
  const result = config({ path, override: options?.override, quiet: true });
  if (result.error) {
    throw result.error;
  }
}
