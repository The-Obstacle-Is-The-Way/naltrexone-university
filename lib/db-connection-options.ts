export const POSTGRES_CONNECTION_PARAMETERS: Readonly<Record<string, string>> =
  {
    TimeZone: 'UTC',
    // The 30-second database backstop deliberately trails the application's
    // 10-15 second user-visible timers, which do not cancel the server query.
    statement_timeout: '30s',
    lock_timeout: '5s',
    idle_in_transaction_session_timeout: '60s',
  } as const;
