import { config } from 'dotenv';

export function loadDotenvFileOrThrow(
  path: string,
  options?: { override?: boolean },
): void {
  const result = config({
    path,
    quiet: true,
    ...(options?.override !== undefined ? { override: options.override } : {}),
  });
  if (result.error) {
    throw result.error;
  }
}
