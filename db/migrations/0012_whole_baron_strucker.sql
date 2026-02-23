ALTER TABLE "idempotency_keys" ADD COLUMN "completed_at" timestamp with time zone;
UPDATE "idempotency_keys"
SET "completed_at" = "created_at"
WHERE "completed_at" IS NULL
  AND ("result_json" IS NOT NULL OR "error_code" IS NOT NULL);
