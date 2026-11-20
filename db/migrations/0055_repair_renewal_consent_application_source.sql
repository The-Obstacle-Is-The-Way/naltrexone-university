-- #743 shipped two 0033 bodies. Only the measured draft needs table DDL.
-- Canonical, fresh and production installations record this migration only.
-- N-1 already reads and writes these named columns. On the draft path the
-- validated CHECK and index take table locks; the measured preview was empty.
-- Older application-source rows cannot be assigned invented identities: the
-- validated CHECK rejects them and Drizzle rolls back the whole migration.
DO $repair$
BEGIN
  IF NOT EXISTS (
    SELECT FROM drizzle.__drizzle_migrations
    WHERE created_at = 1786051636812
      AND hash = 'd3cefbfc623b5a0c8b9b8a58555daab98ac8dde8007aa7bffb1ff6f4dddc8608'
  ) THEN
    RETURN;
  END IF;

  PERFORM set_config('lock_timeout', '5s', true);
  ALTER TABLE public.renewal_consent_records
    ADD COLUMN application_source_id varchar(255),
    DROP CONSTRAINT renewal_consent_records_source_session_chk;
  ALTER TABLE public.renewal_consent_records
    ADD CONSTRAINT renewal_consent_records_source_session_chk CHECK (
      (consent_source = 'stripe_checkout' AND checkout_session_id IS NOT NULL AND setup_session_id IS NULL AND application_source_id IS NULL)
      OR (consent_source = 'stripe_setup' AND setup_session_id IS NOT NULL AND checkout_session_id IS NULL AND application_source_id IS NULL)
      OR (consent_source = 'application' AND checkout_session_id IS NULL AND setup_session_id IS NULL AND application_source_id IS NOT NULL)
    );
  CREATE UNIQUE INDEX renewal_consent_records_application_source_uq
    ON public.renewal_consent_records USING btree (application_source_id)
    WHERE application_source_id IS NOT NULL;
END
$repair$;
