import { describe, expect, it } from 'vitest';
import {
  collectColumnNames,
  collectPrimitiveValues,
} from './repository-test-helpers';

describe('collectColumnNames', () => {
  it('does not collect sibling columns through a Drizzle column table back-reference', () => {
    const siblingColumn = {
      name: 'sibling_column',
      columnType: 'PgText',
    };
    const targetColumn = {
      name: 'target_column',
      columnType: 'PgText',
      table: {
        siblingColumn,
      },
    };

    expect(collectColumnNames(targetColumn)).toEqual(['target_column']);
  });
});

describe('collectPrimitiveValues', () => {
  it('does not collect sibling values through a Drizzle column table back-reference', () => {
    const targetExpression = {
      value: 'target-value',
      table: {
        siblingExpression: {
          value: 'unrelated-sibling-value',
        },
      },
    };

    expect(collectPrimitiveValues(targetExpression)).toEqual(['target-value']);
  });
});
