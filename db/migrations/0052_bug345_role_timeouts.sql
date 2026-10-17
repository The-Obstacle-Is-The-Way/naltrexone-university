-- BUG-345: transaction pooling ignores the application's timeout startup
-- parameters. Set defaults for the connecting role in this database so new
-- backend sessions enforce them for standalone queries and transactions.
-- An ordinary role can change its own user-settable defaults. No application
-- table is locked or changed; serving N-1 code already requests these bounds.
-- Existing backend sessions keep their old settings until recycled. See the
-- Postgres operations guide for rollout and verification before closure.
DO $$
BEGIN
  EXECUTE format(
    'ALTER ROLE CURRENT_USER IN DATABASE %I SET statement_timeout = %L',
    current_database(), '30s'
  );
  EXECUTE format(
    'ALTER ROLE CURRENT_USER IN DATABASE %I SET lock_timeout = %L',
    current_database(), '5s'
  );
  EXECUTE format(
    'ALTER ROLE CURRENT_USER IN DATABASE %I SET idle_in_transaction_session_timeout = %L',
    current_database(), '60s'
  );
END
$$;
