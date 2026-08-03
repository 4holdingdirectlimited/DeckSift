CREATE TABLE "bundle_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"guid" uuid DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"org_id" text NOT NULL,
	"targets" jsonb NOT NULL,
	"reject_bin_number" integer NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bundle_configs_guid_idx" UNIQUE("guid")
);
--> statement-breakpoint
ALTER TABLE "bundle_configs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bundle_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"guid" uuid DEFAULT gen_random_uuid(),
	"config_id" integer NOT NULL,
	"org_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"placed_card_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bundle_runs_guid_idx" UNIQUE("guid")
);
--> statement-breakpoint
ALTER TABLE "bundle_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bundle_runs" ADD CONSTRAINT "bundle_runs_config_id_bundle_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."bundle_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bundle_runs_config_id_idx" ON "bundle_runs" USING btree ("config_id");--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-select" ON "bundle_configs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (("bundle_configs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("bundle_configs"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-insert" ON "bundle_configs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (("bundle_configs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("bundle_configs"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-update" ON "bundle_configs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (("bundle_configs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("bundle_configs"."org_id")) WITH CHECK (("bundle_configs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("bundle_configs"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-delete" ON "bundle_configs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (("bundle_configs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("bundle_configs"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-select" ON "bundle_runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (("bundle_runs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("bundle_runs"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-insert" ON "bundle_runs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (("bundle_runs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("bundle_runs"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-update" ON "bundle_runs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (("bundle_runs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("bundle_runs"."org_id")) WITH CHECK (("bundle_runs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("bundle_runs"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-delete" ON "bundle_runs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (("bundle_runs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("bundle_runs"."org_id"));