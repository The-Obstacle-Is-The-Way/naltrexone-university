import { describe, expect, it } from 'vitest';
import { POSTGRES_CONNECTION_PARAMETERS } from './db-connection-options';

describe('POSTGRES_CONNECTION_PARAMETERS', () => {
  it('pins the complete application-session startup policy', () => {
    expect(POSTGRES_CONNECTION_PARAMETERS).toEqual({
      TimeZone: 'UTC',
      statement_timeout: '30s',
      lock_timeout: '5s',
      idle_in_transaction_session_timeout: '60s',
    });
  });
});
