import { describe, expect, it } from 'vitest';
import { POSTGRES_CONNECTION_PARAMETERS } from './db-connection-options';

describe('POSTGRES_CONNECTION_PARAMETERS', () => {
  it('enforces UTC for database sessions', () => {
    expect(POSTGRES_CONNECTION_PARAMETERS.TimeZone).toBe('UTC');
  });
});
