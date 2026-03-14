CREATE TABLE "pending_stripe_cancellations" (
	"event_id" varchar(255) PRIMARY KEY NOT NULL,
	"stripe_customer_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pending_stripe_cancellations" ADD CONSTRAINT "pending_stripe_cancellations_event_id_clerk_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."clerk_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_stripe_cancellations_created_at_idx" ON "pending_stripe_cancellations" USING btree ("created_at");