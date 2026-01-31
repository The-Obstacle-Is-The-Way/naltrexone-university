CREATE TYPE "public"."practice_mode" AS ENUM('tutor', 'exam');--> statement-breakpoint
CREATE TYPE "public"."question_difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."stripe_subscription_status" AS ENUM('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused');--> statement-breakpoint
CREATE TYPE "public"."tag_kind" AS ENUM('domain', 'topic', 'substance', 'treatment', 'diagnosis');--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"practice_session_id" uuid,
	"selected_choice_id" uuid,
	"is_correct" boolean NOT NULL,
	"time_spent_seconds" integer DEFAULT 0 NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookmarks_user_id_question_id_pk" PRIMARY KEY("user_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "choices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"label" varchar(4) NOT NULL,
	"text_md" text NOT NULL,
	"is_correct" boolean NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" "practice_mode" NOT NULL,
	"params_json" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "question_tags" (
	"question_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "question_tags_question_id_tag_id_pk" PRIMARY KEY("question_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(255) NOT NULL,
	"stem_md" text NOT NULL,
	"explanation_md" text NOT NULL,
	"difficulty" "question_difficulty" NOT NULL,
	"status" "question_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_customer_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"type" varchar(255) NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "stripe_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_subscription_id" varchar(255) NOT NULL,
	"status" "stripe_subscription_status" NOT NULL,
	"price_id" varchar(255) NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"kind" "tag_kind" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" varchar(64) NOT NULL,
	"email" varchar(320) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_practice_session_id_practice_sessions_id_fk" FOREIGN KEY ("practice_session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_selected_choice_id_choices_id_fk" FOREIGN KEY ("selected_choice_id") REFERENCES "public"."choices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choices" ADD CONSTRAINT "choices_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_tags" ADD CONSTRAINT "question_tags_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_tags" ADD CONSTRAINT "question_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_customers" ADD CONSTRAINT "stripe_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_subscriptions" ADD CONSTRAINT "stripe_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempts_user_answered_at_idx" ON "attempts" USING btree ("user_id","answered_at" desc);--> statement-breakpoint
CREATE INDEX "attempts_user_question_answered_at_idx" ON "attempts" USING btree ("user_id","question_id","answered_at" desc);--> statement-breakpoint
CREATE INDEX "attempts_user_is_correct_answered_at_idx" ON "attempts" USING btree ("user_id","is_correct","answered_at" desc);--> statement-breakpoint
CREATE INDEX "attempts_session_answered_at_idx" ON "attempts" USING btree ("practice_session_id","answered_at" desc);--> statement-breakpoint
CREATE INDEX "attempts_question_id_idx" ON "attempts" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "bookmarks_user_created_at_idx" ON "bookmarks" USING btree ("user_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "bookmarks_question_id_idx" ON "bookmarks" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "choices_question_id_idx" ON "choices" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "choices_question_id_label_uq" ON "choices" USING btree ("question_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "choices_question_id_sort_order_uq" ON "choices" USING btree ("question_id","sort_order");--> statement-breakpoint
CREATE INDEX "practice_sessions_user_started_at_idx" ON "practice_sessions" USING btree ("user_id","started_at" desc);--> statement-breakpoint
CREATE INDEX "question_tags_tag_id_idx" ON "question_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "question_tags_question_id_idx" ON "question_tags" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "questions_slug_uq" ON "questions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "questions_status_difficulty_idx" ON "questions" USING btree ("status","difficulty");--> statement-breakpoint
CREATE INDEX "questions_status_created_at_idx" ON "questions" USING btree ("status","created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_customers_user_id_uq" ON "stripe_customers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_customers_stripe_customer_id_uq" ON "stripe_customers" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "stripe_events_type_idx" ON "stripe_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "stripe_events_processed_at_idx" ON "stripe_events" USING btree ("processed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_subscriptions_user_id_uq" ON "stripe_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_subscriptions_stripe_subscription_id_uq" ON "stripe_subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "stripe_subscriptions_user_status_idx" ON "stripe_subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_slug_uq" ON "tags" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tags_kind_slug_idx" ON "tags" USING btree ("kind","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_user_id_uq" ON "users" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");