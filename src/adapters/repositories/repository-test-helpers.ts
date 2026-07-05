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
    ...Reflect.ownKeys(value).flatMap((key) => {
      if (key === 'table') return [];
      return collectColumnNames(
        (value as Record<PropertyKey, unknown>)[key],
        seen,
      );
    }),
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

export function collectColumnNamesForTable(
  node: unknown,
  table: unknown,
): readonly string[] {
  const names = new Set<string>();

  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') {
      return;
    }

    const maybeNode = value as {
      table?: unknown;
      name?: unknown;
      queryChunks?: unknown[];
    };

    if (maybeNode.table === table && typeof maybeNode.name === 'string') {
      names.add(maybeNode.name);
    }

    if (Array.isArray(maybeNode.queryChunks)) {
      for (const chunk of maybeNode.queryChunks) {
        visit(chunk);
      }
    }
  };

  visit(node);
  return [...names];
}
