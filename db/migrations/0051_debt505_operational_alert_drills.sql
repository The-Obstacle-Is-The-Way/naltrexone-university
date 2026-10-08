CREATE TABLE "operational_alert_drills" (
	"cycle" integer PRIMARY KEY NOT NULL,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL
);
