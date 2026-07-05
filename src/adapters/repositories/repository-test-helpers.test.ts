import { describe, expect, it } from 'vitest';
import { collectColumnNames } from './repository-test-helpers';

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
