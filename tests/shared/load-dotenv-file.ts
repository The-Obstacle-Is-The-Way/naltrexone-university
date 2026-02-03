import { config } from 'dotenv';

export function loadDotenvFileOrThrow(
  path: string,
  options?: { override?: boolean },
): void {
  const result = config({ path, override: options?.override });
  if (result.error) {
    throw result.error;
  }
}
