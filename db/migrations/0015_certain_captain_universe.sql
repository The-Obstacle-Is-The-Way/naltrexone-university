CREATE TABLE "clerk_events" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"type" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "deleted_clerk_users" (
	"clerk_user_id" varchar(64) PRIMARY KEY NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "clerk_events_type_idx" ON "clerk_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "clerk_events_processed_at_idx" ON "clerk_events" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "deleted_clerk_users_deleted_at_idx" ON "deleted_clerk_users" USING btree ("deleted_at");