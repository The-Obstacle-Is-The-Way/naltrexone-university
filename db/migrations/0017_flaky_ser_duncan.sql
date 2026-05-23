ALTER TABLE "attempts" ALTER COLUMN "selected_choice_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "is_omitted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_selected_choice_or_omitted_chk" CHECK (("attempts"."selected_choice_id" IS NOT NULL) <> "attempts"."is_omitted");--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_omitted_incorrect_chk" CHECK (NOT "attempts"."is_omitted" OR "attempts"."is_correct" = false);