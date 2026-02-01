import { config } from 'dotenv';

export function loadDotenvFileOrThrow(path: string): void {
  const result = config({ path });
  if (result.error) {
    throw result.error;
  }
}
