CREATE TABLE "chase_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"guid" uuid DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"org_id" text NOT NULL,
	"game_key" text NOT NULL,
	"set_code" text NOT NULL,
	"bin_number" integer NOT NULL,
	"reject_bin_number" integer NOT NULL,
	"collection_guid" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chase_configs_guid_idx" UNIQUE("guid")
);
--> statement-breakpoint
ALTER TABLE "chase_configs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chase_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"guid" uuid DEFAULT gen_random_uuid(),
	"config_id" integer NOT NULL,
	"org_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"found_card_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chase_runs_guid_idx" UNIQUE("guid")
);
--> statement-breakpoint
ALTER TABLE "chase_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"guid" uuid DEFAULT gen_random_uuid(),
	"wishlist_id" integer NOT NULL,
	"org_id" text NOT NULL,
	"card_id" text,
	"name_pattern" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_items_guid_idx" UNIQUE("guid")
);
--> statement-breakpoint
ALTER TABLE "wishlist_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wishlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"guid" uuid DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"org_id" text NOT NULL,
	"game_key" text NOT NULL,
	"bin_number" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wishlists_guid_idx" UNIQUE("guid")
);
--> statement-breakpoint
ALTER TABLE "wishlists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bundle_runs" ADD COLUMN "total_value_usd" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chase_runs" ADD CONSTRAINT "chase_runs_config_id_chase_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."chase_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chase_runs_config_id_idx" ON "chase_runs" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "wishlist_items_wishlist_id_idx" ON "wishlist_items" USING btree ("wishlist_id");--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-select" ON "chase_configs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (("chase_configs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("chase_configs"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-insert" ON "chase_configs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (("chase_configs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("chase_configs"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-update" ON "chase_configs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (("chase_configs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("chase_configs"."org_id")) WITH CHECK (("chase_configs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("chase_configs"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-delete" ON "chase_configs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (("chase_configs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("chase_configs"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-select" ON "chase_runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (("chase_runs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("chase_runs"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-insert" ON "chase_runs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (("chase_runs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("chase_runs"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-update" ON "chase_runs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (("chase_runs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("chase_runs"."org_id")) WITH CHECK (("chase_runs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("chase_runs"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-delete" ON "chase_runs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (("chase_runs"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("chase_runs"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-select" ON "wishlist_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (("wishlist_items"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("wishlist_items"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-insert" ON "wishlist_items" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (("wishlist_items"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("wishlist_items"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-update" ON "wishlist_items" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (("wishlist_items"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("wishlist_items"."org_id")) WITH CHECK (("wishlist_items"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("wishlist_items"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-delete" ON "wishlist_items" AS PERMISSIVE FOR DELETE TO "authenticated" USING (("wishlist_items"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("wishlist_items"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-select" ON "wishlists" AS PERMISSIVE FOR SELECT TO "authenticated" USING (("wishlists"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("wishlists"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-insert" ON "wishlists" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (("wishlists"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("wishlists"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-update" ON "wishlists" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (("wishlists"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("wishlists"."org_id")) WITH CHECK (("wishlists"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("wishlists"."org_id"));--> statement-breakpoint
CREATE POLICY "crud-authenticated-policy-delete" ON "wishlists" AS PERMISSIVE FOR DELETE TO "authenticated" USING (("wishlists"."org_id" = (current_setting('request.jwt.claims', true)::json ->> 'org_id')) AND auth_is_org_member("wishlists"."org_id"));