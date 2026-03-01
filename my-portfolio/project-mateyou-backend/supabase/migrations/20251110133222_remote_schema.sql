create type "public"."member_role" as enum ('normal', 'partner', 'admin');

create type "public"."member_status" as enum ('online', 'offline', 'matching', 'in_game');

create type "public"."partner_status" as enum ('none', 'pending', 'approved', 'rejected');

create type "public"."points_log_type" as enum ('earn', 'spend', 'withdraw');

create type "public"."request_status" as enum ('pending', 'in_progress', 'completed', 'cancelled');

create type "public"."withdrawal_status" as enum ('pending', 'approved', 'rejected', 'cancelled');


  create table "public"."ad_banners" (
    "id" uuid not null default gen_random_uuid(),
    "title" text not null,
    "description" text,
    "background_image" text,
    "mobile_background_image" text,
    "link_url" text,
    "display_location" text default 'main'::text,
    "start_at" timestamp with time zone default now(),
    "end_at" timestamp with time zone,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );



  create table "public"."call_participants" (
    "id" uuid not null default gen_random_uuid(),
    "room_id" uuid,
    "member_id" uuid,
    "partner_id" uuid,
    "joined_at" timestamp with time zone default now(),
    "left_at" timestamp with time zone,
    "duration" interval generated always as ((left_at - joined_at)) stored,
    "is_muted" boolean default false,
    "is_speaking" boolean default false,
    "device_info" jsonb,
    "connection_quality" text,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."call_rooms" (
    "id" uuid not null default gen_random_uuid(),
    "room_code" text,
    "status" text default 'waiting'::text,
    "started_at" timestamp with time zone default now(),
    "ended_at" timestamp with time zone,
    "member_id" uuid,
    "partner_id" uuid,
    "topic" text,
    "last_signal_at" timestamp with time zone,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."discord_activity_logs" (
    "id" uuid not null default gen_random_uuid(),
    "member_id" uuid not null,
    "partner_id" uuid not null,
    "discord_url" text not null,
    "started_at" timestamp with time zone default now(),
    "ended_at" timestamp with time zone,
    "status" text default 'open'::text,
    "metadata" jsonb default '{}'::jsonb,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "channel_id" text
      );



  create table "public"."jobs" (
    "id" uuid not null default gen_random_uuid(),
    "request_id" uuid not null,
    "partner_id" uuid not null,
    "client_id" uuid not null,
    "partner_job_id" uuid,
    "job_name" text,
    "coins_per_job" integer,
    "review_code" uuid,
    "is_reviewed" boolean default false,
    "created_at" timestamp with time zone default now(),
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone default now()
      );



  create table "public"."member_chats" (
    "id" bigint generated always as identity not null,
    "sender_id" uuid not null,
    "receiver_id" uuid not null,
    "message" text not null,
    "is_read" boolean default false,
    "created_at" timestamp with time zone default now(),
    "out_link" text,
    "comment_type" text default 'custom'::text
      );



  create table "public"."member_points_logs" (
    "id" bigint generated always as identity not null,
    "member_id" uuid not null,
    "type" public.points_log_type not null,
    "amount" integer not null,
    "description" text,
    "related_review_id" bigint,
    "created_at" timestamp with time zone default now(),
    "log_id" text not null
      );



  create table "public"."members" (
    "id" uuid not null default gen_random_uuid(),
    "member_code" text,
    "name" text,
    "social_id" text,
    "role" public.member_role default 'normal'::public.member_role,
    "profile_image" text,
    "favorite_game" text,
    "game_info" jsonb,
    "greeting" text,
    "current_status" public.member_status default 'offline'::public.member_status,
    "total_points" integer default 0,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );



  create table "public"."partner_jobs" (
    "id" uuid not null default gen_random_uuid(),
    "partner_id" uuid not null,
    "job_name" text not null,
    "coins_per_job" integer not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "is_active" boolean not null default false
      );



  create table "public"."partner_points_logs" (
    "id" bigint generated always as identity not null,
    "partner_id" uuid not null,
    "type" text not null,
    "amount" integer not null,
    "description" text,
    "created_at" timestamp with time zone default now(),
    "bank_name" text,
    "bank_num" text,
    "bank_owner" text,
    "log_id" text not null default ''''''::text
      );



  create table "public"."partner_requests" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "partner_id" uuid not null,
    "partner_job_id" uuid,
    "request_type" text default 'custom'::text,
    "job_count" integer not null,
    "coins_per_job" integer,
    "total_coins" integer generated always as ((job_count * COALESCE(coins_per_job, 0))) stored,
    "status" public.request_status default 'pending'::public.request_status,
    "requested_at" timestamp with time zone default now(),
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "note" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "call_id" text
      );



  create table "public"."partner_withdrawals" (
    "id" uuid not null default gen_random_uuid(),
    "partner_id" uuid not null,
    "requested_amount" integer not null,
    "status" public.withdrawal_status default 'pending'::public.withdrawal_status,
    "requested_at" timestamp with time zone default now(),
    "reviewed_at" timestamp with time zone,
    "bank_num" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "bank_name" text,
    "bank_owner" text
      );



  create table "public"."partners" (
    "id" uuid not null default gen_random_uuid(),
    "member_id" uuid not null,
    "partner_name" text,
    "partner_message" text,
    "partner_status" public.partner_status default 'pending'::public.partner_status,
    "partner_applied_at" timestamp with time zone default now(),
    "partner_reviewed_at" timestamp with time zone,
    "total_points" integer default 0,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "game_info" jsonb,
    "ben_lists" jsonb default '{}'::jsonb,
    "tosspayments_seller_id" text,
    "tosspayments_ref_seller_id" text,
    "tosspayments_status" text,
    "tosspayments_synced_at" timestamp with time zone,
    "tosspayments_last_error" text,
    "legal_name" text,
    "legal_email" text,
    "legal_phone" text,
    "payout_bank_code" text,
    "payout_bank_name" text,
    "payout_account_number" text,
    "payout_account_holder" text,
    "tosspayments_business_type" text,
    "background_images" jsonb default '[]'::jsonb
      );



  create table "public"."reviews" (
    "id" bigint generated always as identity not null,
    "member_id" uuid,
    "target_partner_id" uuid,
    "rating" integer,
    "comment" text,
    "points_earned" integer default 0,
    "review_code" uuid,
    "created_at" timestamp with time zone default now(),
    "requests_id" text,
    "updated_at" time without time zone
      );


CREATE UNIQUE INDEX ad_banners_pkey ON public.ad_banners USING btree (id);

CREATE UNIQUE INDEX call_participants_pkey ON public.call_participants USING btree (id);

CREATE UNIQUE INDEX call_rooms_pkey ON public.call_rooms USING btree (id);

CREATE UNIQUE INDEX call_rooms_room_code_key ON public.call_rooms USING btree (room_code);

CREATE UNIQUE INDEX discord_activity_logs_pkey ON public.discord_activity_logs USING btree (id);

CREATE INDEX idx_call_participants_member_id ON public.call_participants USING btree (member_id);

CREATE INDEX idx_call_participants_partner_id ON public.call_participants USING btree (partner_id);

CREATE INDEX idx_call_participants_room_id ON public.call_participants USING btree (room_id);

CREATE INDEX idx_call_rooms_member_id ON public.call_rooms USING btree (member_id);

CREATE INDEX idx_call_rooms_partner_id ON public.call_rooms USING btree (partner_id);

CREATE INDEX idx_jobs_client ON public.jobs USING btree (client_id);

CREATE INDEX idx_jobs_partner ON public.jobs USING btree (partner_id);

CREATE INDEX idx_jobs_request ON public.jobs USING btree (request_id);

CREATE INDEX idx_member_points_logs_member ON public.member_points_logs USING btree (member_id);

CREATE INDEX idx_partner_points_logs_partner ON public.partner_points_logs USING btree (partner_id);

CREATE INDEX idx_partner_requests_client ON public.partner_requests USING btree (client_id);

CREATE INDEX idx_partner_requests_partner ON public.partner_requests USING btree (partner_id);

CREATE INDEX idx_partner_requests_status ON public.partner_requests USING btree (status);

CREATE UNIQUE INDEX jobs_pkey ON public.jobs USING btree (id);

CREATE UNIQUE INDEX jobs_review_code_key ON public.jobs USING btree (review_code);

CREATE UNIQUE INDEX member_chats_pkey ON public.member_chats USING btree (id);

CREATE UNIQUE INDEX member_points_logs_pkey ON public.member_points_logs USING btree (id);

CREATE UNIQUE INDEX members_discord_id_key ON public.members USING btree (social_id);

CREATE UNIQUE INDEX members_member_code_key ON public.members USING btree (member_code);

CREATE UNIQUE INDEX members_pkey ON public.members USING btree (id);

CREATE UNIQUE INDEX partner_jobs_partner_id_job_name_key ON public.partner_jobs USING btree (partner_id, job_name);

CREATE UNIQUE INDEX partner_jobs_pkey ON public.partner_jobs USING btree (id);

CREATE UNIQUE INDEX partner_points_logs_pkey ON public.partner_points_logs USING btree (id);

CREATE UNIQUE INDEX partner_requests_pkey ON public.partner_requests USING btree (id);

CREATE UNIQUE INDEX partner_withdrawals_pkey ON public.partner_withdrawals USING btree (id);

CREATE UNIQUE INDEX partners_member_id_key ON public.partners USING btree (member_id);

CREATE UNIQUE INDEX partners_pkey ON public.partners USING btree (id);

CREATE UNIQUE INDEX partners_tosspayments_ref_idx ON public.partners USING btree (tosspayments_ref_seller_id) WHERE (tosspayments_ref_seller_id IS NOT NULL);

CREATE UNIQUE INDEX reviews_pkey ON public.reviews USING btree (id);

alter table "public"."ad_banners" add constraint "ad_banners_pkey" PRIMARY KEY using index "ad_banners_pkey";

alter table "public"."call_participants" add constraint "call_participants_pkey" PRIMARY KEY using index "call_participants_pkey";

alter table "public"."call_rooms" add constraint "call_rooms_pkey" PRIMARY KEY using index "call_rooms_pkey";

alter table "public"."discord_activity_logs" add constraint "discord_activity_logs_pkey" PRIMARY KEY using index "discord_activity_logs_pkey";

alter table "public"."jobs" add constraint "jobs_pkey" PRIMARY KEY using index "jobs_pkey";

alter table "public"."member_chats" add constraint "member_chats_pkey" PRIMARY KEY using index "member_chats_pkey";

alter table "public"."member_points_logs" add constraint "member_points_logs_pkey" PRIMARY KEY using index "member_points_logs_pkey";

alter table "public"."members" add constraint "members_pkey" PRIMARY KEY using index "members_pkey";

alter table "public"."partner_jobs" add constraint "partner_jobs_pkey" PRIMARY KEY using index "partner_jobs_pkey";

alter table "public"."partner_points_logs" add constraint "partner_points_logs_pkey" PRIMARY KEY using index "partner_points_logs_pkey";

alter table "public"."partner_requests" add constraint "partner_requests_pkey" PRIMARY KEY using index "partner_requests_pkey";

alter table "public"."partner_withdrawals" add constraint "partner_withdrawals_pkey" PRIMARY KEY using index "partner_withdrawals_pkey";

alter table "public"."partners" add constraint "partners_pkey" PRIMARY KEY using index "partners_pkey";

alter table "public"."reviews" add constraint "reviews_pkey" PRIMARY KEY using index "reviews_pkey";

alter table "public"."ad_banners" add constraint "ad_banners_display_location_check" CHECK ((display_location = ANY (ARRAY['main'::text, 'partner_dashboard'::text]))) not valid;

alter table "public"."ad_banners" validate constraint "ad_banners_display_location_check";

alter table "public"."call_participants" add constraint "call_participants_member_id_fkey" FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE SET NULL not valid;

alter table "public"."call_participants" validate constraint "call_participants_member_id_fkey";

alter table "public"."call_participants" add constraint "call_participants_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL not valid;

alter table "public"."call_participants" validate constraint "call_participants_partner_id_fkey";

alter table "public"."call_participants" add constraint "call_participants_room_id_fkey" FOREIGN KEY (room_id) REFERENCES public.call_rooms(id) ON DELETE CASCADE not valid;

alter table "public"."call_participants" validate constraint "call_participants_room_id_fkey";

alter table "public"."call_rooms" add constraint "call_rooms_member_id_fkey" FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE SET NULL not valid;

alter table "public"."call_rooms" validate constraint "call_rooms_member_id_fkey";

alter table "public"."call_rooms" add constraint "call_rooms_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL not valid;

alter table "public"."call_rooms" validate constraint "call_rooms_partner_id_fkey";

alter table "public"."call_rooms" add constraint "call_rooms_room_code_key" UNIQUE using index "call_rooms_room_code_key";

alter table "public"."discord_activity_logs" add constraint "discord_activity_logs_member_id_fkey" FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE not valid;

alter table "public"."discord_activity_logs" validate constraint "discord_activity_logs_member_id_fkey";

alter table "public"."discord_activity_logs" add constraint "discord_activity_logs_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE not valid;

alter table "public"."discord_activity_logs" validate constraint "discord_activity_logs_partner_id_fkey";

alter table "public"."jobs" add constraint "jobs_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.members(id) ON DELETE CASCADE not valid;

alter table "public"."jobs" validate constraint "jobs_client_id_fkey";

alter table "public"."jobs" add constraint "jobs_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE not valid;

alter table "public"."jobs" validate constraint "jobs_partner_id_fkey";

alter table "public"."jobs" add constraint "jobs_partner_job_id_fkey" FOREIGN KEY (partner_job_id) REFERENCES public.partner_jobs(id) ON DELETE SET NULL not valid;

alter table "public"."jobs" validate constraint "jobs_partner_job_id_fkey";

alter table "public"."jobs" add constraint "jobs_request_id_fkey" FOREIGN KEY (request_id) REFERENCES public.partner_requests(id) ON DELETE CASCADE not valid;

alter table "public"."jobs" validate constraint "jobs_request_id_fkey";

alter table "public"."jobs" add constraint "jobs_review_code_key" UNIQUE using index "jobs_review_code_key";

alter table "public"."member_chats" add constraint "member_chats_receiver_id_fkey" FOREIGN KEY (receiver_id) REFERENCES public.members(id) ON DELETE CASCADE not valid;

alter table "public"."member_chats" validate constraint "member_chats_receiver_id_fkey";

alter table "public"."member_chats" add constraint "member_chats_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES public.members(id) ON DELETE CASCADE not valid;

alter table "public"."member_chats" validate constraint "member_chats_sender_id_fkey";

alter table "public"."member_points_logs" add constraint "member_points_logs_amount_check" CHECK ((amount >= 0)) not valid;

alter table "public"."member_points_logs" validate constraint "member_points_logs_amount_check";

alter table "public"."member_points_logs" add constraint "member_points_logs_member_id_fkey" FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE not valid;

alter table "public"."member_points_logs" validate constraint "member_points_logs_member_id_fkey";

alter table "public"."member_points_logs" add constraint "member_points_logs_related_review_id_fkey" FOREIGN KEY (related_review_id) REFERENCES public.reviews(id) ON DELETE SET NULL not valid;

alter table "public"."member_points_logs" validate constraint "member_points_logs_related_review_id_fkey";

alter table "public"."members" add constraint "members_discord_id_key" UNIQUE using index "members_discord_id_key";

alter table "public"."members" add constraint "members_member_code_key" UNIQUE using index "members_member_code_key";

alter table "public"."partner_jobs" add constraint "partner_jobs_coins_per_job_check" CHECK ((coins_per_job >= 0)) not valid;

alter table "public"."partner_jobs" validate constraint "partner_jobs_coins_per_job_check";

alter table "public"."partner_jobs" add constraint "partner_jobs_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE not valid;

alter table "public"."partner_jobs" validate constraint "partner_jobs_partner_id_fkey";

alter table "public"."partner_jobs" add constraint "partner_jobs_partner_id_job_name_key" UNIQUE using index "partner_jobs_partner_id_job_name_key";

alter table "public"."partner_points_logs" add constraint "partner_points_logs_amount_check" CHECK ((amount >= 0)) not valid;

alter table "public"."partner_points_logs" validate constraint "partner_points_logs_amount_check";

alter table "public"."partner_points_logs" add constraint "partner_points_logs_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE not valid;

alter table "public"."partner_points_logs" validate constraint "partner_points_logs_partner_id_fkey";

alter table "public"."partner_requests" add constraint "partner_requests_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.members(id) ON DELETE CASCADE not valid;

alter table "public"."partner_requests" validate constraint "partner_requests_client_id_fkey";

alter table "public"."partner_requests" add constraint "partner_requests_job_count_check" CHECK ((job_count > 0)) not valid;

alter table "public"."partner_requests" validate constraint "partner_requests_job_count_check";

alter table "public"."partner_requests" add constraint "partner_requests_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE not valid;

alter table "public"."partner_requests" validate constraint "partner_requests_partner_id_fkey";

alter table "public"."partner_requests" add constraint "partner_requests_partner_job_id_fkey" FOREIGN KEY (partner_job_id) REFERENCES public.partner_jobs(id) ON DELETE SET NULL not valid;

alter table "public"."partner_requests" validate constraint "partner_requests_partner_job_id_fkey";

alter table "public"."partner_withdrawals" add constraint "partner_withdrawals_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE not valid;

alter table "public"."partner_withdrawals" validate constraint "partner_withdrawals_partner_id_fkey";

alter table "public"."partner_withdrawals" add constraint "partner_withdrawals_requested_amount_check" CHECK ((requested_amount > 0)) not valid;

alter table "public"."partner_withdrawals" validate constraint "partner_withdrawals_requested_amount_check";

alter table "public"."partners" add constraint "partners_member_id_fkey" FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE not valid;

alter table "public"."partners" validate constraint "partners_member_id_fkey";

alter table "public"."partners" add constraint "partners_member_id_key" UNIQUE using index "partners_member_id_key";

alter table "public"."reviews" add constraint "reviews_member_id_fkey" FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE SET NULL not valid;

alter table "public"."reviews" validate constraint "reviews_member_id_fkey";

alter table "public"."reviews" add constraint "reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5))) not valid;

alter table "public"."reviews" validate constraint "reviews_rating_check";

alter table "public"."reviews" add constraint "reviews_review_code_fkey" FOREIGN KEY (review_code) REFERENCES public.jobs(review_code) ON DELETE SET NULL not valid;

alter table "public"."reviews" validate constraint "reviews_review_code_fkey";

alter table "public"."reviews" add constraint "reviews_target_partner_id_fkey" FOREIGN KEY (target_partner_id) REFERENCES public.partners(id) ON DELETE SET NULL not valid;

alter table "public"."reviews" validate constraint "reviews_target_partner_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_partner_withdrawal()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.log_partner_total_points_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.pr_default_coins()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.coins_per_job IS NULL AND NEW.partner_job_id IS NOT NULL THEN
    SELECT coins_per_job INTO NEW.coins_per_job
    FROM public.partner_jobs WHERE id = NEW.partner_job_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pr_points_on_complete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    INSERT INTO public.partner_points_logs (partner_id, type, amount, description)
    VALUES (NEW.partner_id, 'earn', NEW.total_coins, '의뢰 완료 지급');
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_member_total_points()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_partner_total_points()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_job_review_code()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.review_code IS NULL THEN
    NEW.review_code := gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_member_role_partner()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE public.members SET role='partner', updated_at = now() WHERE id = NEW.member_id;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_partner_name()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE public.partners
  SET partner_name = NEW.name, updated_at = now()
  WHERE member_id = NEW.id;
  RETURN NEW;
END;
$function$
;

grant delete on table "public"."ad_banners" to "anon";

grant insert on table "public"."ad_banners" to "anon";

grant references on table "public"."ad_banners" to "anon";

grant select on table "public"."ad_banners" to "anon";

grant trigger on table "public"."ad_banners" to "anon";

grant truncate on table "public"."ad_banners" to "anon";

grant update on table "public"."ad_banners" to "anon";

grant delete on table "public"."ad_banners" to "authenticated";

grant insert on table "public"."ad_banners" to "authenticated";

grant references on table "public"."ad_banners" to "authenticated";

grant select on table "public"."ad_banners" to "authenticated";

grant trigger on table "public"."ad_banners" to "authenticated";

grant truncate on table "public"."ad_banners" to "authenticated";

grant update on table "public"."ad_banners" to "authenticated";

grant delete on table "public"."ad_banners" to "service_role";

grant insert on table "public"."ad_banners" to "service_role";

grant references on table "public"."ad_banners" to "service_role";

grant select on table "public"."ad_banners" to "service_role";

grant trigger on table "public"."ad_banners" to "service_role";

grant truncate on table "public"."ad_banners" to "service_role";

grant update on table "public"."ad_banners" to "service_role";

grant delete on table "public"."call_participants" to "anon";

grant insert on table "public"."call_participants" to "anon";

grant references on table "public"."call_participants" to "anon";

grant select on table "public"."call_participants" to "anon";

grant trigger on table "public"."call_participants" to "anon";

grant truncate on table "public"."call_participants" to "anon";

grant update on table "public"."call_participants" to "anon";

grant delete on table "public"."call_participants" to "authenticated";

grant insert on table "public"."call_participants" to "authenticated";

grant references on table "public"."call_participants" to "authenticated";

grant select on table "public"."call_participants" to "authenticated";

grant trigger on table "public"."call_participants" to "authenticated";

grant truncate on table "public"."call_participants" to "authenticated";

grant update on table "public"."call_participants" to "authenticated";

grant delete on table "public"."call_participants" to "service_role";

grant insert on table "public"."call_participants" to "service_role";

grant references on table "public"."call_participants" to "service_role";

grant select on table "public"."call_participants" to "service_role";

grant trigger on table "public"."call_participants" to "service_role";

grant truncate on table "public"."call_participants" to "service_role";

grant update on table "public"."call_participants" to "service_role";

grant delete on table "public"."call_rooms" to "anon";

grant insert on table "public"."call_rooms" to "anon";

grant references on table "public"."call_rooms" to "anon";

grant select on table "public"."call_rooms" to "anon";

grant trigger on table "public"."call_rooms" to "anon";

grant truncate on table "public"."call_rooms" to "anon";

grant update on table "public"."call_rooms" to "anon";

grant delete on table "public"."call_rooms" to "authenticated";

grant insert on table "public"."call_rooms" to "authenticated";

grant references on table "public"."call_rooms" to "authenticated";

grant select on table "public"."call_rooms" to "authenticated";

grant trigger on table "public"."call_rooms" to "authenticated";

grant truncate on table "public"."call_rooms" to "authenticated";

grant update on table "public"."call_rooms" to "authenticated";

grant delete on table "public"."call_rooms" to "service_role";

grant insert on table "public"."call_rooms" to "service_role";

grant references on table "public"."call_rooms" to "service_role";

grant select on table "public"."call_rooms" to "service_role";

grant trigger on table "public"."call_rooms" to "service_role";

grant truncate on table "public"."call_rooms" to "service_role";

grant update on table "public"."call_rooms" to "service_role";

grant delete on table "public"."discord_activity_logs" to "anon";

grant insert on table "public"."discord_activity_logs" to "anon";

grant references on table "public"."discord_activity_logs" to "anon";

grant select on table "public"."discord_activity_logs" to "anon";

grant trigger on table "public"."discord_activity_logs" to "anon";

grant truncate on table "public"."discord_activity_logs" to "anon";

grant update on table "public"."discord_activity_logs" to "anon";

grant delete on table "public"."discord_activity_logs" to "authenticated";

grant insert on table "public"."discord_activity_logs" to "authenticated";

grant references on table "public"."discord_activity_logs" to "authenticated";

grant select on table "public"."discord_activity_logs" to "authenticated";

grant trigger on table "public"."discord_activity_logs" to "authenticated";

grant truncate on table "public"."discord_activity_logs" to "authenticated";

grant update on table "public"."discord_activity_logs" to "authenticated";

grant delete on table "public"."discord_activity_logs" to "service_role";

grant insert on table "public"."discord_activity_logs" to "service_role";

grant references on table "public"."discord_activity_logs" to "service_role";

grant select on table "public"."discord_activity_logs" to "service_role";

grant trigger on table "public"."discord_activity_logs" to "service_role";

grant truncate on table "public"."discord_activity_logs" to "service_role";

grant update on table "public"."discord_activity_logs" to "service_role";

grant delete on table "public"."jobs" to "anon";

grant insert on table "public"."jobs" to "anon";

grant references on table "public"."jobs" to "anon";

grant select on table "public"."jobs" to "anon";

grant trigger on table "public"."jobs" to "anon";

grant truncate on table "public"."jobs" to "anon";

grant update on table "public"."jobs" to "anon";

grant delete on table "public"."jobs" to "authenticated";

grant insert on table "public"."jobs" to "authenticated";

grant references on table "public"."jobs" to "authenticated";

grant select on table "public"."jobs" to "authenticated";

grant trigger on table "public"."jobs" to "authenticated";

grant truncate on table "public"."jobs" to "authenticated";

grant update on table "public"."jobs" to "authenticated";

grant delete on table "public"."jobs" to "service_role";

grant insert on table "public"."jobs" to "service_role";

grant references on table "public"."jobs" to "service_role";

grant select on table "public"."jobs" to "service_role";

grant trigger on table "public"."jobs" to "service_role";

grant truncate on table "public"."jobs" to "service_role";

grant update on table "public"."jobs" to "service_role";

grant delete on table "public"."member_chats" to "anon";

grant insert on table "public"."member_chats" to "anon";

grant references on table "public"."member_chats" to "anon";

grant select on table "public"."member_chats" to "anon";

grant trigger on table "public"."member_chats" to "anon";

grant truncate on table "public"."member_chats" to "anon";

grant update on table "public"."member_chats" to "anon";

grant delete on table "public"."member_chats" to "authenticated";

grant insert on table "public"."member_chats" to "authenticated";

grant references on table "public"."member_chats" to "authenticated";

grant select on table "public"."member_chats" to "authenticated";

grant trigger on table "public"."member_chats" to "authenticated";

grant truncate on table "public"."member_chats" to "authenticated";

grant update on table "public"."member_chats" to "authenticated";

grant delete on table "public"."member_chats" to "service_role";

grant insert on table "public"."member_chats" to "service_role";

grant references on table "public"."member_chats" to "service_role";

grant select on table "public"."member_chats" to "service_role";

grant trigger on table "public"."member_chats" to "service_role";

grant truncate on table "public"."member_chats" to "service_role";

grant update on table "public"."member_chats" to "service_role";

grant delete on table "public"."member_points_logs" to "anon";

grant insert on table "public"."member_points_logs" to "anon";

grant references on table "public"."member_points_logs" to "anon";

grant select on table "public"."member_points_logs" to "anon";

grant trigger on table "public"."member_points_logs" to "anon";

grant truncate on table "public"."member_points_logs" to "anon";

grant update on table "public"."member_points_logs" to "anon";

grant delete on table "public"."member_points_logs" to "authenticated";

grant insert on table "public"."member_points_logs" to "authenticated";

grant references on table "public"."member_points_logs" to "authenticated";

grant select on table "public"."member_points_logs" to "authenticated";

grant trigger on table "public"."member_points_logs" to "authenticated";

grant truncate on table "public"."member_points_logs" to "authenticated";

grant update on table "public"."member_points_logs" to "authenticated";

grant delete on table "public"."member_points_logs" to "service_role";

grant insert on table "public"."member_points_logs" to "service_role";

grant references on table "public"."member_points_logs" to "service_role";

grant select on table "public"."member_points_logs" to "service_role";

grant trigger on table "public"."member_points_logs" to "service_role";

grant truncate on table "public"."member_points_logs" to "service_role";

grant update on table "public"."member_points_logs" to "service_role";

grant delete on table "public"."members" to "anon";

grant insert on table "public"."members" to "anon";

grant references on table "public"."members" to "anon";

grant select on table "public"."members" to "anon";

grant trigger on table "public"."members" to "anon";

grant truncate on table "public"."members" to "anon";

grant update on table "public"."members" to "anon";

grant delete on table "public"."members" to "authenticated";

grant insert on table "public"."members" to "authenticated";

grant references on table "public"."members" to "authenticated";

grant select on table "public"."members" to "authenticated";

grant trigger on table "public"."members" to "authenticated";

grant truncate on table "public"."members" to "authenticated";

grant update on table "public"."members" to "authenticated";

grant delete on table "public"."members" to "service_role";

grant insert on table "public"."members" to "service_role";

grant references on table "public"."members" to "service_role";

grant select on table "public"."members" to "service_role";

grant trigger on table "public"."members" to "service_role";

grant truncate on table "public"."members" to "service_role";

grant update on table "public"."members" to "service_role";

grant delete on table "public"."partner_jobs" to "anon";

grant insert on table "public"."partner_jobs" to "anon";

grant references on table "public"."partner_jobs" to "anon";

grant select on table "public"."partner_jobs" to "anon";

grant trigger on table "public"."partner_jobs" to "anon";

grant truncate on table "public"."partner_jobs" to "anon";

grant update on table "public"."partner_jobs" to "anon";

grant delete on table "public"."partner_jobs" to "authenticated";

grant insert on table "public"."partner_jobs" to "authenticated";

grant references on table "public"."partner_jobs" to "authenticated";

grant select on table "public"."partner_jobs" to "authenticated";

grant trigger on table "public"."partner_jobs" to "authenticated";

grant truncate on table "public"."partner_jobs" to "authenticated";

grant update on table "public"."partner_jobs" to "authenticated";

grant delete on table "public"."partner_jobs" to "service_role";

grant insert on table "public"."partner_jobs" to "service_role";

grant references on table "public"."partner_jobs" to "service_role";

grant select on table "public"."partner_jobs" to "service_role";

grant trigger on table "public"."partner_jobs" to "service_role";

grant truncate on table "public"."partner_jobs" to "service_role";

grant update on table "public"."partner_jobs" to "service_role";

grant delete on table "public"."partner_points_logs" to "anon";

grant insert on table "public"."partner_points_logs" to "anon";

grant references on table "public"."partner_points_logs" to "anon";

grant select on table "public"."partner_points_logs" to "anon";

grant trigger on table "public"."partner_points_logs" to "anon";

grant truncate on table "public"."partner_points_logs" to "anon";

grant update on table "public"."partner_points_logs" to "anon";

grant delete on table "public"."partner_points_logs" to "authenticated";

grant insert on table "public"."partner_points_logs" to "authenticated";

grant references on table "public"."partner_points_logs" to "authenticated";

grant select on table "public"."partner_points_logs" to "authenticated";

grant trigger on table "public"."partner_points_logs" to "authenticated";

grant truncate on table "public"."partner_points_logs" to "authenticated";

grant update on table "public"."partner_points_logs" to "authenticated";

grant delete on table "public"."partner_points_logs" to "service_role";

grant insert on table "public"."partner_points_logs" to "service_role";

grant references on table "public"."partner_points_logs" to "service_role";

grant select on table "public"."partner_points_logs" to "service_role";

grant trigger on table "public"."partner_points_logs" to "service_role";

grant truncate on table "public"."partner_points_logs" to "service_role";

grant update on table "public"."partner_points_logs" to "service_role";

grant delete on table "public"."partner_requests" to "anon";

grant insert on table "public"."partner_requests" to "anon";

grant references on table "public"."partner_requests" to "anon";

grant select on table "public"."partner_requests" to "anon";

grant trigger on table "public"."partner_requests" to "anon";

grant truncate on table "public"."partner_requests" to "anon";

grant update on table "public"."partner_requests" to "anon";

grant delete on table "public"."partner_requests" to "authenticated";

grant insert on table "public"."partner_requests" to "authenticated";

grant references on table "public"."partner_requests" to "authenticated";

grant select on table "public"."partner_requests" to "authenticated";

grant trigger on table "public"."partner_requests" to "authenticated";

grant truncate on table "public"."partner_requests" to "authenticated";

grant update on table "public"."partner_requests" to "authenticated";

grant delete on table "public"."partner_requests" to "service_role";

grant insert on table "public"."partner_requests" to "service_role";

grant references on table "public"."partner_requests" to "service_role";

grant select on table "public"."partner_requests" to "service_role";

grant trigger on table "public"."partner_requests" to "service_role";

grant truncate on table "public"."partner_requests" to "service_role";

grant update on table "public"."partner_requests" to "service_role";

grant delete on table "public"."partner_withdrawals" to "anon";

grant insert on table "public"."partner_withdrawals" to "anon";

grant references on table "public"."partner_withdrawals" to "anon";

grant select on table "public"."partner_withdrawals" to "anon";

grant trigger on table "public"."partner_withdrawals" to "anon";

grant truncate on table "public"."partner_withdrawals" to "anon";

grant update on table "public"."partner_withdrawals" to "anon";

grant delete on table "public"."partner_withdrawals" to "authenticated";

grant insert on table "public"."partner_withdrawals" to "authenticated";

grant references on table "public"."partner_withdrawals" to "authenticated";

grant select on table "public"."partner_withdrawals" to "authenticated";

grant trigger on table "public"."partner_withdrawals" to "authenticated";

grant truncate on table "public"."partner_withdrawals" to "authenticated";

grant update on table "public"."partner_withdrawals" to "authenticated";

grant delete on table "public"."partner_withdrawals" to "service_role";

grant insert on table "public"."partner_withdrawals" to "service_role";

grant references on table "public"."partner_withdrawals" to "service_role";

grant select on table "public"."partner_withdrawals" to "service_role";

grant trigger on table "public"."partner_withdrawals" to "service_role";

grant truncate on table "public"."partner_withdrawals" to "service_role";

grant update on table "public"."partner_withdrawals" to "service_role";

grant delete on table "public"."partners" to "anon";

grant insert on table "public"."partners" to "anon";

grant references on table "public"."partners" to "anon";

grant select on table "public"."partners" to "anon";

grant trigger on table "public"."partners" to "anon";

grant truncate on table "public"."partners" to "anon";

grant update on table "public"."partners" to "anon";

grant delete on table "public"."partners" to "authenticated";

grant insert on table "public"."partners" to "authenticated";

grant references on table "public"."partners" to "authenticated";

grant select on table "public"."partners" to "authenticated";

grant trigger on table "public"."partners" to "authenticated";

grant truncate on table "public"."partners" to "authenticated";

grant update on table "public"."partners" to "authenticated";

grant delete on table "public"."partners" to "service_role";

grant insert on table "public"."partners" to "service_role";

grant references on table "public"."partners" to "service_role";

grant select on table "public"."partners" to "service_role";

grant trigger on table "public"."partners" to "service_role";

grant truncate on table "public"."partners" to "service_role";

grant update on table "public"."partners" to "service_role";

grant delete on table "public"."reviews" to "anon";

grant insert on table "public"."reviews" to "anon";

grant references on table "public"."reviews" to "anon";

grant select on table "public"."reviews" to "anon";

grant trigger on table "public"."reviews" to "anon";

grant truncate on table "public"."reviews" to "anon";

grant update on table "public"."reviews" to "anon";

grant delete on table "public"."reviews" to "authenticated";

grant insert on table "public"."reviews" to "authenticated";

grant references on table "public"."reviews" to "authenticated";

grant select on table "public"."reviews" to "authenticated";

grant trigger on table "public"."reviews" to "authenticated";

grant truncate on table "public"."reviews" to "authenticated";

grant update on table "public"."reviews" to "authenticated";

grant delete on table "public"."reviews" to "service_role";

grant insert on table "public"."reviews" to "service_role";

grant references on table "public"."reviews" to "service_role";

grant select on table "public"."reviews" to "service_role";

grant trigger on table "public"."reviews" to "service_role";

grant truncate on table "public"."reviews" to "service_role";

grant update on table "public"."reviews" to "service_role";

CREATE TRIGGER trg_ad_banners_updated BEFORE UPDATE ON public.ad_banners FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_discord_activity_logs_updated BEFORE UPDATE ON public.discord_activity_logs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_job_review_code BEFORE INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.set_job_review_code();

CREATE TRIGGER trg_member_points_refresh AFTER INSERT OR DELETE OR UPDATE ON public.member_points_logs FOR EACH ROW EXECUTE FUNCTION public.refresh_member_total_points();

CREATE TRIGGER trg_members_updated BEFORE UPDATE ON public.members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_sync_partner_name AFTER INSERT OR UPDATE OF name ON public.members FOR EACH ROW EXECUTE FUNCTION public.sync_partner_name();

CREATE TRIGGER trg_partner_jobs_updated BEFORE UPDATE ON public.partner_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_partner_requests_updated BEFORE UPDATE ON public.partner_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_pr_default_coins BEFORE INSERT ON public.partner_requests FOR EACH ROW EXECUTE FUNCTION public.pr_default_coins();

CREATE TRIGGER trg_handle_partner_withdrawal AFTER UPDATE OF status ON public.partner_withdrawals FOR EACH ROW EXECUTE FUNCTION public.handle_partner_withdrawal();

CREATE TRIGGER trg_log_partner_total_points_change AFTER UPDATE OF total_points ON public.partners FOR EACH ROW EXECUTE FUNCTION public.log_partner_total_points_change();

CREATE TRIGGER trg_partners_updated BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_member_role_partner AFTER INSERT ON public.partners FOR EACH ROW EXECUTE FUNCTION public.set_member_role_partner();


