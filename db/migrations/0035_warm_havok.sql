ALTER TYPE "public"."trial_payment_method_setup_operation_status" ADD VALUE 'terminal';--> statement-breakpoint
ALTER TYPE "public"."trial_payment_method_setup_operation_status" ADD VALUE 'expired';--> statement-breakpoint
ALTER TABLE "trial_payment_method_setup_operations" ADD COLUMN "terminal_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trial_payment_method_setup_operations" ADD COLUMN "terminal_reason" varchar(64);--> statement-breakpoint
ALTER TABLE "trial_payment_method_setup_operations" ADD COLUMN "expired_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "trial_payment_method_setup_operations_status_expired_at_idx" ON "trial_payment_method_setup_operations" USING btree ("status","expired_at");