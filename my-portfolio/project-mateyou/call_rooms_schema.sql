


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."member_role" AS ENUM (
    'normal',
    'partner',
    'admin'
);


ALTER TYPE "public"."member_role" OWNER TO "postgres";


CREATE TYPE "public"."member_status" AS ENUM (
    'online',
    'offline',
    'matching',
    'in_game'
);


ALTER TYPE "public"."member_status" OWNER TO "postgres";


CREATE TYPE "public"."partner_status" AS ENUM (
    'none',
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."partner_status" OWNER TO "postgres";


CREATE TYPE "public"."points_log_type" AS ENUM (
    'earn',
    'spend',
    'withdraw'
);


ALTER TYPE "public"."points_log_type" OWNER TO "postgres";


CREATE TYPE "public"."request_status" AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."request_status" OWNER TO "postgres";


CREATE TYPE "public"."withdrawal_status" AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
);


ALTER TYPE "public"."withdrawal_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_partner_request_transaction"("p_client_id" "uuid", "p_partner_id" "uuid", "p_total_points" integer, "p_job_name" "text", "p_job_count" integer, "p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_client_description TEXT;
  v_partner_description TEXT;
BEGIN
  -- Create descriptions
  v_client_description := p_job_name || ' ' || p_job_count || '회 의뢰 완료';
  v_partner_description := p_job_name || ' ' || p_job_count || '회 완료';

  -- 1. Add member_points_logs for client (spend) and update member total_points
  UPDATE members
  SET total_points = COALESCE(total_points, 0) - p_total_points
  WHERE id = p_client_id;

  INSERT INTO member_points_logs (member_id, type, amount, description, log_id)
  VALUES (p_client_id, 'spend', p_total_points, v_client_description, p_request_id);

  -- 2. Add partner_points_logs for partner (earn) - removed related_review_id
  INSERT INTO partner_points_logs (partner_id, type, amount, description)
  VALUES (p_partner_id, 'earn', p_total_points, v_partner_description);

  -- 3. Update partner total_points
  UPDATE partners
  SET total_points = COALESCE(total_points, 0) + p_total_points
  WHERE id = p_partner_id;
END;
$$;


ALTER FUNCTION "public"."complete_partner_request_transaction"("p_client_id" "uuid", "p_partner_id" "uuid", "p_total_points" integer, "p_job_name" "text", "p_job_count" integer, "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_partner_withdrawal"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    UPDATE public.partners
    SET total_points = GREATEST(COALESCE(total_points,0) - NEW.requested_amount,0),
        updated_at = now()
    WHERE id = NEW.partner_id;
    NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_partner_withdrawal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_partner_points_log"("p_partner_id" "uuid", "p_type" character varying, "p_amount" integer, "p_description" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO partner_points_logs (partner_id, type, amount, description)
  VALUES (p_partner_id, p_type::points_log_type, p_amount, p_description);
END;
$$;


ALTER FUNCTION "public"."insert_partner_points_log"("p_partner_id" "uuid", "p_type" character varying, "p_amount" integer, "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_partner_total_points_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE diff int;
BEGIN
  IF NEW.total_points IS DISTINCT FROM OLD.total_points THEN
    diff := COALESCE(NEW.total_points,0) - COALESCE(OLD.total_points,0);
    INSERT INTO public.partner_points_logs (partner_id, type, amount, description)
    VALUES (
      NEW.id,
      CASE WHEN diff >= 0 THEN 'earn' ELSE 'spend' END,
      ABS(diff),
      'total_points changed'
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_partner_total_points_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pr_default_coins"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.coins_per_job IS NULL AND NEW.partner_job_id IS NOT NULL THEN
    SELECT coins_per_job INTO NEW.coins_per_job
    FROM public.partner_jobs WHERE id = NEW.partner_job_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."pr_default_coins"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pr_points_on_complete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    INSERT INTO public.partner_points_logs (partner_id, type, amount, description)
    VALUES (NEW.partner_id, 'earn', NEW.total_coins, '의뢰 완료 지급');
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."pr_points_on_complete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_member_total_points"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_total int;
BEGIN
  SELECT COALESCE(SUM(
    CASE WHEN type='earn' THEN amount
         WHEN type IN ('spend','withdraw') THEN -amount
         ELSE 0 END
  ),0) INTO v_total
  FROM public.member_points_logs
  WHERE member_id = COALESCE(NEW.member_id, OLD.member_id);

  UPDATE public.members
  SET total_points = v_total, updated_at = now()
  WHERE id = COALESCE(NEW.member_id, OLD.member_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."refresh_member_total_points"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_partner_total_points"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE total int;
BEGIN
  SELECT COALESCE(SUM(
    CASE WHEN type='earn' THEN amount
         WHEN type IN ('spend','withdraw') THEN -amount
         ELSE 0 END
  ),0) INTO total
  FROM public.partner_points_logs
  WHERE partner_id = NEW.partner_id;

  UPDATE public.partners
  SET total_points = total, updated_at = now()
  WHERE id = NEW.partner_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."refresh_partner_total_points"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_job_review_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.review_code IS NULL THEN
    NEW.review_code := gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_job_review_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_member_role_partner"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE public.members SET role='partner', updated_at = now() WHERE id = NEW.member_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_member_role_partner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_partner_name"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE public.partners
  SET partner_name = NEW.name, updated_at = now()
  WHERE member_id = NEW.id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_partner_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_member_points_with_log"("p_member_id" "uuid", "p_type" character varying, "p_amount" integer, "p_description" "text", "p_log_id" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_log_id UUID;
  v_new_total_points INTEGER;
  v_points_change INTEGER;
  v_log_record RECORD;
BEGIN
  -- Calculate points change based on type
  v_points_change := CASE
    WHEN p_type = 'earn' THEN p_amount
    ELSE -p_amount
  END;

  -- Insert points log
  INSERT INTO member_points_logs (member_id, type, amount, description, log_id)
  VALUES (p_member_id, p_type, p_amount, p_description, p_log_id)
  RETURNING * INTO v_log_record;

  -- Update member total_points
  UPDATE members
  SET total_points = COALESCE(total_points, 0) + v_points_change
  WHERE id = p_member_id
  RETURNING total_points INTO v_new_total_points;

  -- Return result as JSON
  RETURN json_build_object(
    'log', row_to_json(v_log_record),
    'new_total_points', v_new_total_points
  );
END;
$$;


ALTER FUNCTION "public"."update_member_points_with_log"("p_member_id" "uuid", "p_type" character varying, "p_amount" integer, "p_description" "text", "p_log_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ad_banners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "background_image" "text",
    "mobile_background_image" "text",
    "link_url" "text",
    "display_location" "text" DEFAULT 'main'::"text",
    "start_at" timestamp with time zone DEFAULT "now"(),
    "end_at" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ad_banners_display_location_check" CHECK (("display_location" = ANY (ARRAY['main'::"text", 'partner_dashboard'::"text"])))
);


ALTER TABLE "public"."ad_banners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."call_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid",
    "member_id" "uuid",
    "partner_id" "uuid",
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "left_at" timestamp with time zone,
    "duration" interval GENERATED ALWAYS AS (("left_at" - "joined_at")) STORED,
    "is_muted" boolean DEFAULT false,
    "is_speaking" boolean DEFAULT false,
    "device_info" "jsonb",
    "connection_quality" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."call_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."call_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_code" "text",
    "status" "text" DEFAULT 'waiting'::"text",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "ended_at" timestamp with time zone,
    "member_id" "uuid",
    "partner_id" "uuid",
    "topic" "text",
    "last_signal_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."call_rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discord_activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_id" "uuid" NOT NULL,
    "partner_id" "uuid" NOT NULL,
    "discord_url" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "ended_at" timestamp with time zone,
    "status" "text" DEFAULT 'open'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "channel_id" "text"
);


ALTER TABLE "public"."discord_activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "partner_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "partner_job_id" "uuid",
    "job_name" "text",
    "coins_per_job" integer,
    "review_code" "uuid",
    "is_reviewed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_chats" (
    "id" bigint NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "out_link" "text",
    "comment_type" "text" DEFAULT 'custom'::"text"
);


ALTER TABLE "public"."member_chats" OWNER TO "postgres";


ALTER TABLE "public"."member_chats" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."member_chats_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."member_points_logs" (
    "id" bigint NOT NULL,
    "member_id" "uuid" NOT NULL,
    "type" "public"."points_log_type" NOT NULL,
    "amount" integer NOT NULL,
    "description" "text",
    "related_review_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "log_id" "text" NOT NULL,
    CONSTRAINT "member_points_logs_amount_check" CHECK (("amount" >= 0))
);


ALTER TABLE "public"."member_points_logs" OWNER TO "postgres";


ALTER TABLE "public"."member_points_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."member_points_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_code" "text",
    "name" "text",
    "social_id" "text",
    "role" "public"."member_role" DEFAULT 'normal'::"public"."member_role",
    "profile_image" "text",
    "favorite_game" "text",
    "game_info" "jsonb",
    "greeting" "text",
    "current_status" "public"."member_status" DEFAULT 'offline'::"public"."member_status",
    "total_points" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partner_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "partner_id" "uuid" NOT NULL,
    "job_name" "text" NOT NULL,
    "coins_per_job" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT false NOT NULL,
    CONSTRAINT "partner_jobs_coins_per_job_check" CHECK (("coins_per_job" >= 0))
);


ALTER TABLE "public"."partner_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partner_points_logs" (
    "id" bigint NOT NULL,
    "partner_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "amount" integer NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "bank_name" "text",
    "bank_num" "text",
    "bank_owner" "text",
    "log_id" "text" DEFAULT ''''''::"text" NOT NULL,
    CONSTRAINT "partner_points_logs_amount_check" CHECK (("amount" >= 0))
);


ALTER TABLE "public"."partner_points_logs" OWNER TO "postgres";


ALTER TABLE "public"."partner_points_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."partner_points_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."partner_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "partner_id" "uuid" NOT NULL,
    "partner_job_id" "uuid",
    "request_type" "text" DEFAULT 'custom'::"text",
    "job_count" integer NOT NULL,
    "coins_per_job" integer,
    "total_coins" integer GENERATED ALWAYS AS (("job_count" * COALESCE("coins_per_job", 0))) STORED,
    "status" "public"."request_status" DEFAULT 'pending'::"public"."request_status",
    "requested_at" timestamp with time zone DEFAULT "now"(),
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "call_id" "text",
    CONSTRAINT "partner_requests_job_count_check" CHECK (("job_count" > 0))
);


ALTER TABLE "public"."partner_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partner_withdrawals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "partner_id" "uuid" NOT NULL,
    "requested_amount" integer NOT NULL,
    "status" "public"."withdrawal_status" DEFAULT 'pending'::"public"."withdrawal_status",
    "requested_at" timestamp with time zone DEFAULT "now"(),
    "reviewed_at" timestamp with time zone,
    "bank_num" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "bank_name" "text",
    "bank_owner" "text",
    CONSTRAINT "partner_withdrawals_requested_amount_check" CHECK (("requested_amount" > 0))
);


ALTER TABLE "public"."partner_withdrawals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_id" "uuid" NOT NULL,
    "partner_name" "text",
    "partner_message" "text",
    "partner_status" "public"."partner_status" DEFAULT 'pending'::"public"."partner_status",
    "partner_applied_at" timestamp with time zone DEFAULT "now"(),
    "partner_reviewed_at" timestamp with time zone,
    "total_points" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "game_info" "jsonb",
    "ben_lists" "jsonb" DEFAULT '{}'::"jsonb",
    "tosspayments_seller_id" "text",
    "tosspayments_ref_seller_id" "text",
    "tosspayments_status" "text",
    "tosspayments_synced_at" timestamp with time zone,
    "tosspayments_last_error" "text",
    "legal_name" "text",
    "legal_email" "text",
    "legal_phone" "text",
    "payout_bank_code" "text",
    "payout_bank_name" "text",
    "payout_account_number" "text",
    "payout_account_holder" "text",
    "tosspayments_business_type" "text",
    "background_images" "jsonb" DEFAULT '[]'::"jsonb"
);


ALTER TABLE "public"."partners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" bigint NOT NULL,
    "member_id" "uuid",
    "target_partner_id" "uuid",
    "rating" integer,
    "comment" "text",
    "points_earned" integer DEFAULT 0,
    "review_code" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "requests_id" "text",
    "updated_at" time without time zone,
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


ALTER TABLE "public"."reviews" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."reviews_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."ad_banners"
    ADD CONSTRAINT "ad_banners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."call_participants"
    ADD CONSTRAINT "call_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."call_rooms"
    ADD CONSTRAINT "call_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."call_rooms"
    ADD CONSTRAINT "call_rooms_room_code_key" UNIQUE ("room_code");



ALTER TABLE ONLY "public"."discord_activity_logs"
    ADD CONSTRAINT "discord_activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_review_code_key" UNIQUE ("review_code");



ALTER TABLE ONLY "public"."member_chats"
    ADD CONSTRAINT "member_chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."member_points_logs"
    ADD CONSTRAINT "member_points_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_discord_id_key" UNIQUE ("social_id");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_member_code_key" UNIQUE ("member_code");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partner_jobs"
    ADD CONSTRAINT "partner_jobs_partner_id_job_name_key" UNIQUE ("partner_id", "job_name");



ALTER TABLE ONLY "public"."partner_jobs"
    ADD CONSTRAINT "partner_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partner_points_logs"
    ADD CONSTRAINT "partner_points_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partner_requests"
    ADD CONSTRAINT "partner_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partner_withdrawals"
    ADD CONSTRAINT "partner_withdrawals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partners"
    ADD CONSTRAINT "partners_member_id_key" UNIQUE ("member_id");



ALTER TABLE ONLY "public"."partners"
    ADD CONSTRAINT "partners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_call_participants_member_id" ON "public"."call_participants" USING "btree" ("member_id");



CREATE INDEX "idx_call_participants_partner_id" ON "public"."call_participants" USING "btree" ("partner_id");



CREATE INDEX "idx_call_participants_room_id" ON "public"."call_participants" USING "btree" ("room_id");



CREATE INDEX "idx_call_rooms_member_id" ON "public"."call_rooms" USING "btree" ("member_id");



CREATE INDEX "idx_call_rooms_partner_id" ON "public"."call_rooms" USING "btree" ("partner_id");



CREATE INDEX "idx_jobs_client" ON "public"."jobs" USING "btree" ("client_id");



CREATE INDEX "idx_jobs_partner" ON "public"."jobs" USING "btree" ("partner_id");



CREATE INDEX "idx_jobs_request" ON "public"."jobs" USING "btree" ("request_id");



CREATE INDEX "idx_member_points_logs_member" ON "public"."member_points_logs" USING "btree" ("member_id");



CREATE INDEX "idx_partner_points_logs_partner" ON "public"."partner_points_logs" USING "btree" ("partner_id");



CREATE INDEX "idx_partner_requests_client" ON "public"."partner_requests" USING "btree" ("client_id");



CREATE INDEX "idx_partner_requests_partner" ON "public"."partner_requests" USING "btree" ("partner_id");



CREATE INDEX "idx_partner_requests_status" ON "public"."partner_requests" USING "btree" ("status");



CREATE UNIQUE INDEX "partners_tosspayments_ref_idx" ON "public"."partners" USING "btree" ("tosspayments_ref_seller_id") WHERE ("tosspayments_ref_seller_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "trg_ad_banners_updated" BEFORE UPDATE ON "public"."ad_banners" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_discord_activity_logs_updated" BEFORE UPDATE ON "public"."discord_activity_logs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_handle_partner_withdrawal" AFTER UPDATE OF "status" ON "public"."partner_withdrawals" FOR EACH ROW EXECUTE FUNCTION "public"."handle_partner_withdrawal"();



CREATE OR REPLACE TRIGGER "trg_log_partner_total_points_change" AFTER UPDATE OF "total_points" ON "public"."partners" FOR EACH ROW EXECUTE FUNCTION "public"."log_partner_total_points_change"();



CREATE OR REPLACE TRIGGER "trg_member_points_refresh" AFTER INSERT OR DELETE OR UPDATE ON "public"."member_points_logs" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_member_total_points"();



CREATE OR REPLACE TRIGGER "trg_members_updated" BEFORE UPDATE ON "public"."members" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_partner_jobs_updated" BEFORE UPDATE ON "public"."partner_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_partner_requests_updated" BEFORE UPDATE ON "public"."partner_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_partners_updated" BEFORE UPDATE ON "public"."partners" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_pr_default_coins" BEFORE INSERT ON "public"."partner_requests" FOR EACH ROW EXECUTE FUNCTION "public"."pr_default_coins"();



CREATE OR REPLACE TRIGGER "trg_set_job_review_code" BEFORE INSERT ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_job_review_code"();



CREATE OR REPLACE TRIGGER "trg_set_member_role_partner" AFTER INSERT ON "public"."partners" FOR EACH ROW EXECUTE FUNCTION "public"."set_member_role_partner"();



CREATE OR REPLACE TRIGGER "trg_sync_partner_name" AFTER INSERT OR UPDATE OF "name" ON "public"."members" FOR EACH ROW EXECUTE FUNCTION "public"."sync_partner_name"();



ALTER TABLE ONLY "public"."call_participants"
    ADD CONSTRAINT "call_participants_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."call_participants"
    ADD CONSTRAINT "call_participants_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."call_participants"
    ADD CONSTRAINT "call_participants_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."call_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."call_rooms"
    ADD CONSTRAINT "call_rooms_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."call_rooms"
    ADD CONSTRAINT "call_rooms_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."discord_activity_logs"
    ADD CONSTRAINT "discord_activity_logs_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."discord_activity_logs"
    ADD CONSTRAINT "discord_activity_logs_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_partner_job_id_fkey" FOREIGN KEY ("partner_job_id") REFERENCES "public"."partner_jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."partner_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_chats"
    ADD CONSTRAINT "member_chats_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_chats"
    ADD CONSTRAINT "member_chats_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_points_logs"
    ADD CONSTRAINT "member_points_logs_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_points_logs"
    ADD CONSTRAINT "member_points_logs_related_review_id_fkey" FOREIGN KEY ("related_review_id") REFERENCES "public"."reviews"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."partner_jobs"
    ADD CONSTRAINT "partner_jobs_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_points_logs"
    ADD CONSTRAINT "partner_points_logs_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_requests"
    ADD CONSTRAINT "partner_requests_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_requests"
    ADD CONSTRAINT "partner_requests_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_requests"
    ADD CONSTRAINT "partner_requests_partner_job_id_fkey" FOREIGN KEY ("partner_job_id") REFERENCES "public"."partner_jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."partner_withdrawals"
    ADD CONSTRAINT "partner_withdrawals_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partners"
    ADD CONSTRAINT "partners_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_review_code_fkey" FOREIGN KEY ("review_code") REFERENCES "public"."jobs"("review_code") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_target_partner_id_fkey" FOREIGN KEY ("target_partner_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL;





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";































































































































































GRANT ALL ON FUNCTION "public"."complete_partner_request_transaction"("p_client_id" "uuid", "p_partner_id" "uuid", "p_total_points" integer, "p_job_name" "text", "p_job_count" integer, "p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_partner_request_transaction"("p_client_id" "uuid", "p_partner_id" "uuid", "p_total_points" integer, "p_job_name" "text", "p_job_count" integer, "p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_partner_request_transaction"("p_client_id" "uuid", "p_partner_id" "uuid", "p_total_points" integer, "p_job_name" "text", "p_job_count" integer, "p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_partner_withdrawal"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_partner_withdrawal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_partner_withdrawal"() TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_partner_points_log"("p_partner_id" "uuid", "p_type" character varying, "p_amount" integer, "p_description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_partner_points_log"("p_partner_id" "uuid", "p_type" character varying, "p_amount" integer, "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_partner_points_log"("p_partner_id" "uuid", "p_type" character varying, "p_amount" integer, "p_description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_partner_total_points_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_partner_total_points_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_partner_total_points_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pr_default_coins"() TO "anon";
GRANT ALL ON FUNCTION "public"."pr_default_coins"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pr_default_coins"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pr_points_on_complete"() TO "anon";
GRANT ALL ON FUNCTION "public"."pr_points_on_complete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pr_points_on_complete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_member_total_points"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_member_total_points"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_member_total_points"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_partner_total_points"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_partner_total_points"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_partner_total_points"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_job_review_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_job_review_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_job_review_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_member_role_partner"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_member_role_partner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_member_role_partner"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_partner_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_partner_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_partner_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_member_points_with_log"("p_member_id" "uuid", "p_type" character varying, "p_amount" integer, "p_description" "text", "p_log_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_member_points_with_log"("p_member_id" "uuid", "p_type" character varying, "p_amount" integer, "p_description" "text", "p_log_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_member_points_with_log"("p_member_id" "uuid", "p_type" character varying, "p_amount" integer, "p_description" "text", "p_log_id" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."ad_banners" TO "anon";
GRANT ALL ON TABLE "public"."ad_banners" TO "authenticated";
GRANT ALL ON TABLE "public"."ad_banners" TO "service_role";



GRANT ALL ON TABLE "public"."call_participants" TO "anon";
GRANT ALL ON TABLE "public"."call_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."call_participants" TO "service_role";



GRANT ALL ON TABLE "public"."call_rooms" TO "anon";
GRANT ALL ON TABLE "public"."call_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."call_rooms" TO "service_role";



GRANT ALL ON TABLE "public"."discord_activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."discord_activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."discord_activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."jobs" TO "anon";
GRANT ALL ON TABLE "public"."jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs" TO "service_role";



GRANT ALL ON TABLE "public"."member_chats" TO "anon";
GRANT ALL ON TABLE "public"."member_chats" TO "authenticated";
GRANT ALL ON TABLE "public"."member_chats" TO "service_role";



GRANT ALL ON SEQUENCE "public"."member_chats_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."member_chats_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."member_chats_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."member_points_logs" TO "anon";
GRANT ALL ON TABLE "public"."member_points_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."member_points_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."member_points_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."member_points_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."member_points_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."members" TO "anon";
GRANT ALL ON TABLE "public"."members" TO "authenticated";
GRANT ALL ON TABLE "public"."members" TO "service_role";



GRANT ALL ON TABLE "public"."partner_jobs" TO "anon";
GRANT ALL ON TABLE "public"."partner_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."partner_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."partner_points_logs" TO "anon";
GRANT ALL ON TABLE "public"."partner_points_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."partner_points_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."partner_points_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."partner_points_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."partner_points_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."partner_requests" TO "anon";
GRANT ALL ON TABLE "public"."partner_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."partner_requests" TO "service_role";



GRANT ALL ON TABLE "public"."partner_withdrawals" TO "anon";
GRANT ALL ON TABLE "public"."partner_withdrawals" TO "authenticated";
GRANT ALL ON TABLE "public"."partner_withdrawals" TO "service_role";



GRANT ALL ON TABLE "public"."partners" TO "anon";
GRANT ALL ON TABLE "public"."partners" TO "authenticated";
GRANT ALL ON TABLE "public"."partners" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON SEQUENCE "public"."reviews_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."reviews_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."reviews_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































