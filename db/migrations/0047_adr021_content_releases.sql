-- ADR-021 phase 4b (DEBT-483): releases, the activation pointer and holds.
--
-- A release is an immutable, hash-addressed manifest with its selectable set
-- (content_release_items). Triggers keep releases, their items and
-- withdrawals immutable, and let a hold change only by being lifted, once:
-- each is a record of a decision. Activation, in one transaction, moves the single
-- pointer to a release and materializes questions.status and
-- current_revision_id from it minus the overlay (question_withdrawals and
-- unlifted question_holds). Each activation leaves a receipt row in
-- content_release_activations. The pointer row is created here with no active
-- release, so the seed and activation can lock it before any release exists.
--
-- N-1: the serving deployment reads none of these tables, and nothing
-- activates a release in production in this step.
--
-- Locks: new tables only, plus foreign keys to question_revisions, which take
-- SHARE ROW EXCLUSIVE on it until commit and block only the operator-run seed.
CREATE TABLE "content_release_activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"previous_release_id" uuid,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_release_items" (
	"release_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"question_revision_id" uuid NOT NULL,
	CONSTRAINT "content_release_items_release_id_question_id_pk" PRIMARY KEY("release_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "content_release_pointer" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"active_release_id" uuid,
	"activated_at" timestamp with time zone,
	CONSTRAINT "content_release_pointer_single_row_chk" CHECK ("content_release_pointer"."id")
);
--> statement-breakpoint
CREATE TABLE "content_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manifest" jsonb NOT NULL,
	"manifest_hash" varchar(64) NOT NULL,
	"parent_release_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_releases_manifest_hash_chk" CHECK ("content_releases"."manifest_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "question_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"question_revision_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"authority" text NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifted_at" timestamp with time zone,
	CONSTRAINT "question_holds_reason_chk" CHECK ("question_holds"."reason" ~ '[^[:space:]]'),
	CONSTRAINT "question_holds_authority_chk" CHECK ("question_holds"."authority" ~ '[^[:space:]]'),
	CONSTRAINT "question_holds_lifted_after_placed_chk" CHECK ("question_holds"."lifted_at" IS NULL OR "question_holds"."lifted_at" >= "question_holds"."placed_at")
);
--> statement-breakpoint
ALTER TABLE "content_release_activations" ADD CONSTRAINT "content_release_activations_release_id_content_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."content_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_release_activations" ADD CONSTRAINT "content_release_activations_previous_release_id_content_releases_id_fk" FOREIGN KEY ("previous_release_id") REFERENCES "public"."content_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_release_items" ADD CONSTRAINT "content_release_items_release_id_content_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."content_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_release_items" ADD CONSTRAINT "content_release_items_question_revision_fk" FOREIGN KEY ("question_revision_id","question_id") REFERENCES "public"."question_revisions"("id","question_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_release_pointer" ADD CONSTRAINT "content_release_pointer_active_release_id_content_releases_id_fk" FOREIGN KEY ("active_release_id") REFERENCES "public"."content_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_releases" ADD CONSTRAINT "content_releases_parent_release_id_content_releases_id_fk" FOREIGN KEY ("parent_release_id") REFERENCES "public"."content_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_holds" ADD CONSTRAINT "question_holds_question_revision_fk" FOREIGN KEY ("question_revision_id","question_id") REFERENCES "public"."question_revisions"("id","question_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_release_activations_release_id_idx" ON "content_release_activations" USING btree ("release_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_releases_manifest_hash_uq" ON "content_releases" USING btree ("manifest_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "question_holds_unlifted_uq" ON "question_holds" USING btree ("question_revision_id") WHERE lifted_at IS NULL;--> statement-breakpoint
INSERT INTO "content_release_pointer" ("id", "active_release_id", "activated_at") VALUES (true, NULL, NULL);--> statement-breakpoint
CREATE FUNCTION "reject_immutable_row_update_v1"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ADR-021: % rows are immutable', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $$;--> statement-breakpoint
CREATE TRIGGER "content_releases_reject_update" BEFORE UPDATE ON "content_releases"
  FOR EACH ROW EXECUTE FUNCTION "reject_immutable_row_update_v1"();--> statement-breakpoint
CREATE TRIGGER "content_release_items_reject_update" BEFORE UPDATE ON "content_release_items"
  FOR EACH ROW EXECUTE FUNCTION "reject_immutable_row_update_v1"();--> statement-breakpoint
CREATE TRIGGER "question_withdrawals_reject_update" BEFORE UPDATE ON "question_withdrawals"
  FOR EACH ROW EXECUTE FUNCTION "reject_immutable_row_update_v1"();--> statement-breakpoint
CREATE FUNCTION "question_holds_lift_only_v1"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.lifted_at IS NULL AND NEW.lifted_at IS NOT NULL
    AND (NEW.id, NEW.question_id, NEW.question_revision_id, NEW.reason,
      NEW.authority, NEW.placed_at)
      IS NOT DISTINCT FROM (OLD.id, OLD.question_id, OLD.question_revision_id,
      OLD.reason, OLD.authority, OLD.placed_at) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'ADR-021: a hold is only ever lifted, once'
    USING ERRCODE = 'restrict_violation';
END $$;--> statement-breakpoint
CREATE TRIGGER "question_holds_lift_only" BEFORE UPDATE ON "question_holds"
  FOR EACH ROW EXECUTE FUNCTION "question_holds_lift_only_v1"();
