import { config } from 'dotenv';

export function loadDotenvFileOrThrow(path: string): void {
  const result = config({ path, override: true });
  if (result.error) {
    throw result.error;
  }
}
