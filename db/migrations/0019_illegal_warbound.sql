CREATE TYPE "public"."question_feedback_category" AS ENUM('incorrect_answer', 'ambiguous_wording', 'typo_formatting', 'outdated_reference', 'other');--> statement-breakpoint
CREATE TYPE "public"."question_feedback_kind" AS ENUM('rating', 'report');--> statement-breakpoint
CREATE TYPE "public"."question_feedback_rating" AS ENUM('helpful', 'not_helpful');--> statement-breakpoint
CREATE TABLE "question_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"attempt_id" uuid,
	"practice_session_id" uuid,
	"kind" "question_feedback_kind" NOT NULL,
	"rating" "question_feedback_rating",
	"category" "question_feedback_category",
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_feedback_kind_shape_chk" CHECK (("question_feedback"."kind" = 'rating' AND "question_feedback"."category" IS NULL AND "question_feedback"."comment" IS NULL)
          OR ("question_feedback"."kind" = 'report' AND "question_feedback"."category" IS NOT NULL AND "question_feedback"."rating" IS NULL)),
	CONSTRAINT "question_feedback_comment_len_chk" CHECK ("question_feedback"."comment" IS NULL OR char_length("question_feedback"."comment") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "question_feedback" ADD CONSTRAINT "question_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_feedback" ADD CONSTRAINT "question_feedback_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_feedback" ADD CONSTRAINT "question_feedback_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_feedback" ADD CONSTRAINT "question_feedback_practice_session_id_practice_sessions_id_fk" FOREIGN KEY ("practice_session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_feedback_question_created_at_idx" ON "question_feedback" USING btree ("question_id","created_at" desc,"id" desc);--> statement-breakpoint
CREATE INDEX "question_feedback_rating_user_question_created_at_idx" ON "question_feedback" USING btree ("user_id","question_id","created_at" desc,"id" desc) WHERE "question_feedback"."kind" = 'rating';--> statement-breakpoint
CREATE INDEX "question_feedback_kind_created_at_idx" ON "question_feedback" USING btree ("kind","created_at" desc,"id" desc);