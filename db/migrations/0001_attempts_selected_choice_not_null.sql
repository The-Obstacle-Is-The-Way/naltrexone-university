ALTER TABLE "attempts" DROP CONSTRAINT "attempts_selected_choice_id_choices_id_fk";
--> statement-breakpoint
ALTER TABLE "attempts" ALTER COLUMN "selected_choice_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_selected_choice_id_choices_id_fk" FOREIGN KEY ("selected_choice_id") REFERENCES "public"."choices"("id") ON DELETE restrict ON UPDATE no action;