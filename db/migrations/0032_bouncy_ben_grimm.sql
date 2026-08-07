CREATE TYPE "public"."trial_payment_method_setup_operation_status" AS ENUM('pending', 'processing', 'completed');--> statement-breakpoint
CREATE TABLE "trial_payment_method_setup_operations" (
	"session_id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_customer_id" varchar(255) NOT NULL,
	"stripe_subscription_id" varchar(255) NOT NULL,
	"plan" varchar(16) NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"frequency" varchar(16) NOT NULL,
	"trial_ends_at" timestamp with time zone NOT NULL,
	"disclosure_snapshot" text NOT NULL,
	"disclosure_version" varchar(64) NOT NULL,
	"terms_version" varchar(64) NOT NULL,
	"terms_hash" varchar(128) NOT NULL,
	"status" "trial_payment_method_setup_operation_status" DEFAULT 'pending' NOT NULL,
	"claim_id" varchar(255),
	"claimed_at" timestamp with time zone,
	"stripe_payment_method_id" varchar(255),
	"payment_method_attached_at" timestamp with time zone,
	"subscription_default_set_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trial_payment_method_setup_operations" ADD CONSTRAINT "trial_payment_method_setup_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trial_payment_method_setup_operations_user_id_idx" ON "trial_payment_method_setup_operations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trial_payment_method_setup_operations_status_claimed_at_idx" ON "trial_payment_method_setup_operations" USING btree ("status","claimed_at");