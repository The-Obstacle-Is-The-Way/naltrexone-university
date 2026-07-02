import { expect, vi } from 'vitest';

export function restoreDrizzlePracticeSessionRepositoryTestMocks() {
  vi.useRealTimers();
  vi.restoreAllMocks();
}

export function collectColumnNames(
  value: unknown,
  seen = new Set<object>(),
): string[] {
  if (typeof value !== 'object' || value === null || seen.has(value)) return [];
  seen.add(value);

  const maybeColumn = value as { name?: unknown; columnType?: unknown };
  const ownName =
    typeof maybeColumn.name === 'string' &&
    typeof maybeColumn.columnType === 'string'
      ? [maybeColumn.name]
      : [];

  return [
    ...ownName,
    ...Reflect.ownKeys(value).flatMap((key) =>
      collectColumnNames((value as Record<PropertyKey, unknown>)[key], seen),
    ),
  ];
}

export function collectPrimitiveValues(
  value: unknown,
  seen = new Set<object>(),
): Array<string | number | boolean | null> {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return [value];
  }
  if (typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);

  return Reflect.ownKeys(value).flatMap((key) =>
    collectPrimitiveValues((value as Record<PropertyKey, unknown>)[key], seen),
  );
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function expectStateSelectPredicate(
  predicate: unknown,
  expectedSessionIds: readonly string[],
) {
  expect([...new Set(collectColumnNames(predicate))]).toEqual(
    expect.arrayContaining(['practice_session_id']),
  );
  const uuidValues = collectPrimitiveValues(predicate).filter(
    (value): value is string =>
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
  expect(uniqueSorted(uuidValues)).toEqual(uniqueSorted(expectedSessionIds));
}
