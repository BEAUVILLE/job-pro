begin;

-- DIGIY PRO JOB — ALIGNEMENT CLOUD ET RLS V1 — VIERGE
-- Aucun téléphone, PIN, nom, slug ou profil d'abonné.
-- Objectifs :
-- 1) publier une mission PRO par RPC ;
-- 2) conserver candidature publique et lecture/mise à jour PRO par RPC ;
-- 3) fermer les accès directs trop larges aux tables JOBS.

create or replace function public.digiy_jobs_pro_insert_offer(
  p_slug text,
  p_payload jsonb
)
returns public.digiy_jobs_offers_pro
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text;
  v_title text;
  v_city text;
  v_row public.digiy_jobs_offers_pro;
begin
  v_slug := lower(trim(coalesce(p_slug, '')));
  v_title := trim(coalesce(p_payload->>'title', ''));
  v_city := trim(coalesce(p_payload->>'city', ''));

  if v_slug = '' then
    raise exception 'Repère JOBS manquant.';
  end if;

  if v_title = '' then
    raise exception 'Intitulé de mission requis.';
  end if;

  if v_city = '' then
    raise exception 'Ville requise.';
  end if;

  perform public.digiy_jobs_assert_access_by_slug(v_slug);

  insert into public.digiy_jobs_offers_pro (
    workspace_slug,
    owner_id,
    title,
    sector,
    city,
    contract_type,
    pay,
    status,
    description,
    employer_name,
    country,
    requirements,
    has_housing,
    has_family_welcome,
    contact_phone,
    published_at,
    created_at,
    updated_at,
    slug
  )
  values (
    v_slug,
    nullif(trim(coalesce(p_payload->>'owner_id', '')), ''),
    v_title,
    coalesce(nullif(trim(p_payload->>'sector'), ''), 'service'),
    v_city,
    coalesce(nullif(trim(p_payload->>'contract_type'), ''), 'mission'),
    nullif(trim(coalesce(p_payload->>'pay', '')), ''),
    'active',
    nullif(trim(coalesce(p_payload->>'description', '')), ''),
    nullif(trim(coalesce(p_payload->>'employer_name', '')), ''),
    coalesce(nullif(trim(p_payload->>'country'), ''), 'Sénégal'),
    nullif(trim(coalesce(p_payload->>'requirements', '')), ''),
    coalesce((p_payload->>'has_housing')::boolean, false),
    coalesce((p_payload->>'has_family_welcome')::boolean, false),
    nullif(regexp_replace(coalesce(p_payload->>'contact_phone', ''), '[^0-9+]', '', 'g'), ''),
    now(),
    now(),
    now(),
    v_slug
  )
  returning * into v_row;

  return v_row;
end;
$$;

drop policy if exists digiy_jobs_candidates_pro_all on public.digiy_jobs_candidates_pro;
drop policy if exists jobs_candidates_public_insert on public.digiy_jobs_candidates_pro;
drop policy if exists jobs_candidates_select_all_light on public.digiy_jobs_candidates_pro;
drop policy if exists jobs_candidates_update_all_light on public.digiy_jobs_candidates_pro;
drop policy if exists digiy_jobs_offers_pro_all on public.digiy_jobs_offers_pro;
drop policy if exists jobs_offers_public_read_active on public.digiy_jobs_offers_pro;
drop policy if exists digiy_jobs_missions_pro_all on public.digiy_jobs_missions_pro;
drop policy if exists digiy_jobs_matches_pro_all on public.digiy_jobs_matches_pro;

alter table public.digiy_jobs_candidates_pro enable row level security;
alter table public.digiy_jobs_offers_pro enable row level security;
alter table public.digiy_jobs_missions_pro enable row level security;
alter table public.digiy_jobs_matches_pro enable row level security;

revoke all on table public.digiy_jobs_candidates_pro from public, anon, authenticated;
revoke all on table public.digiy_jobs_offers_pro from public, anon, authenticated;
revoke all on table public.digiy_jobs_missions_pro from public, anon, authenticated;
revoke all on table public.digiy_jobs_matches_pro from public, anon, authenticated;

revoke all on function public.digiy_jobs_assert_access_by_slug(text) from public, anon, authenticated;
revoke all on function public.digiy_jobs_pro_insert_candidate(text,jsonb) from public, anon, authenticated;

revoke all on function public.digiy_jobs_public_offers() from public;
revoke all on function public.digiy_jobs_public_offer(uuid) from public;
revoke all on function public.digiy_jobs_public_apply(uuid,text,text,text,text,text,text,text,text) from public;

grant execute on function public.digiy_jobs_public_offers() to anon, authenticated;
grant execute on function public.digiy_jobs_public_offer(uuid) to anon, authenticated;
grant execute on function public.digiy_jobs_public_apply(uuid,text,text,text,text,text,text,text,text) to anon, authenticated;

revoke all on function public.digiy_jobs_pro_offers_by_slug(text) from public;
revoke all on function public.digiy_jobs_pro_candidates_by_slug(text) from public;
revoke all on function public.digiy_jobs_pro_update_candidate_status(text,uuid,text) from public;
revoke all on function public.digiy_jobs_get_bureau_by_slug(text) from public;
revoke all on function public.digiy_jobs_pro_insert_offer(text,jsonb) from public;

grant execute on function public.digiy_jobs_pro_offers_by_slug(text) to anon, authenticated;
grant execute on function public.digiy_jobs_pro_candidates_by_slug(text) to anon, authenticated;
grant execute on function public.digiy_jobs_pro_update_candidate_status(text,uuid,text) to anon, authenticated;
grant execute on function public.digiy_jobs_get_bureau_by_slug(text) to anon, authenticated;
grant execute on function public.digiy_jobs_pro_insert_offer(text,jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

select
  to_regprocedure('public.digiy_jobs_public_apply(uuid,text,text,text,text,text,text,text,text)') is not null as candidature_publique_rpc,
  to_regprocedure('public.digiy_jobs_pro_insert_offer(text,jsonb)') is not null as publication_mission_rpc,
  to_regprocedure('public.digiy_jobs_pro_candidates_by_slug(text)') is not null as lecture_candidatures_rpc,
  to_regprocedure('public.digiy_jobs_pro_update_candidate_status(text,uuid,text)') is not null as statut_candidat_rpc,
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('digiy_jobs_candidates_pro','digiy_jobs_offers_pro','digiy_jobs_missions_pro','digiy_jobs_matches_pro')
      and policyname in ('digiy_jobs_candidates_pro_all','jobs_candidates_public_insert','jobs_candidates_select_all_light','jobs_candidates_update_all_light','digiy_jobs_offers_pro_all','jobs_offers_public_read_active','digiy_jobs_missions_pro_all','digiy_jobs_matches_pro_all')
  ) as politiques_ouvertes_supprimees;
