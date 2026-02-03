CREATE TABLE "idempotency_keys" (
	"user_id" uuid NOT NULL,
	"action" varchar(255) NOT NULL,
	"key" varchar(255) NOT NULL,
	"result_json" jsonb,
	"error_code" varchar(255),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_user_id_action_key_pk" PRIMARY KEY("user_id","action","key")
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");