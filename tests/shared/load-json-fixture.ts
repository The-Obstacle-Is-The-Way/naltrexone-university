import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadJsonFixture<T = unknown>(relativePath: string): T {
  const fullPath = resolve(process.cwd(), 'tests/fixtures', relativePath);
  const raw = readFileSync(fullPath, 'utf8');
  return JSON.parse(raw) as T;
}
