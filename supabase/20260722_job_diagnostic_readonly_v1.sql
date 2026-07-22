begin transaction read only;

set local statement_timeout = '30s';

-- DIGIY PRO JOB — DIAGNOSTIC PRODUCTION V1 — LECTURE SEULE
-- Aucune donnée d'abonné, candidat, téléphone, PIN ou slug dans ce fichier.
-- Aucune création, modification ou suppression.
-- Objectif : confirmer le rail public candidature → recruteur et son isolation.

-- 01. Fonctions JOBS réellement installées.
select
  '01_FONCTIONS' as section,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname in (
      'digiy_verify_pin',
      'digiy_has_access',
      'digiy_has_module_access_from_abos',
      'digiy_jobs_public_offers'
    )
    or p.proname ilike '%jobs%'
    or p.proname ilike '%candidate%'
    or p.proname ilike '%candidat%'
    or p.proname ilike '%application%'
    or p.proname ilike '%recruit%'
  )
order by p.proname, pg_get_function_identity_arguments(p.oid);

-- 02. Relations JOBS.
select
  '02_RELATIONS' as section,
  n.nspname as schema_name,
  c.relname as relation_name,
  case c.relkind
    when 'r' then 'table'
    when 'p' then 'partitioned_table'
    when 'v' then 'view'
    when 'm' then 'materialized_view'
    when 'f' then 'foreign_table'
    else c.relkind::text
  end as relation_type,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r','p','v','m','f')
  and (
    c.relname ilike '%jobs%'
    or c.relname ilike '%candidate%'
    or c.relname ilike '%candidat%'
    or c.relname ilike '%application%'
    or c.relname ilike '%recruit%'
  )
order by c.relname;

-- 03. Colonnes.
select
  '03_COLONNES' as section,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and (
    table_name ilike '%jobs%'
    or table_name ilike '%candidate%'
    or table_name ilike '%candidat%'
    or table_name ilike '%application%'
    or table_name ilike '%recruit%'
  )
order by table_name, ordinal_position;

-- 04. Contraintes.
select
  '04_CONTRAINTES' as section,
  rel.relname as table_name,
  con.conname as constraint_name,
  case con.contype
    when 'p' then 'PRIMARY KEY'
    when 'u' then 'UNIQUE'
    when 'f' then 'FOREIGN KEY'
    when 'c' then 'CHECK'
    when 'x' then 'EXCLUSION'
    else con.contype::text
  end as constraint_type,
  pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public'
  and (
    rel.relname ilike '%jobs%'
    or rel.relname ilike '%candidate%'
    or rel.relname ilike '%candidat%'
    or rel.relname ilike '%application%'
    or rel.relname ilike '%recruit%'
  )
order by rel.relname, con.conname;

-- 05. Index.
select
  '05_INDEX' as section,
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and (
    tablename ilike '%jobs%'
    or tablename ilike '%candidate%'
    or tablename ilike '%candidat%'
    or tablename ilike '%application%'
    or tablename ilike '%recruit%'
  )
order by tablename, indexname;

-- 06. RLS.
select
  '06_RLS' as section,
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r','p')
  and (
    c.relname ilike '%jobs%'
    or c.relname ilike '%candidate%'
    or c.relname ilike '%candidat%'
    or c.relname ilike '%application%'
    or c.relname ilike '%recruit%'
  )
order by c.relname;

-- 07. Politiques.
select
  '07_POLITIQUES' as section,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and (
    tablename ilike '%jobs%'
    or tablename ilike '%candidate%'
    or tablename ilike '%candidat%'
    or tablename ilike '%application%'
    or tablename ilike '%recruit%'
  )
order by tablename, policyname;

-- 08. Triggers.
select
  '08_TRIGGERS' as section,
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and (
    event_object_table ilike '%jobs%'
    or event_object_table ilike '%candidate%'
    or event_object_table ilike '%candidat%'
    or event_object_table ilike '%application%'
    or event_object_table ilike '%recruit%'
  )
order by event_object_table, trigger_name, event_manipulation;

-- 09. Droits web sur tables.
select
  '09_DROITS_TABLES' as section,
  grantee,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated','public')
  and (
    table_name ilike '%jobs%'
    or table_name ilike '%candidate%'
    or table_name ilike '%candidat%'
    or table_name ilike '%application%'
    or table_name ilike '%recruit%'
  )
order by table_name, grantee, privilege_type;

-- 10. Droits web sur fonctions.
select
  '10_DROITS_FONCTIONS' as section,
  grantee,
  routine_name,
  privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and grantee in ('anon','authenticated','public')
  and (
    routine_name ilike '%jobs%'
    or routine_name ilike '%candidate%'
    or routine_name ilike '%candidat%'
    or routine_name ilike '%application%'
    or routine_name ilike '%recruit%'
    or routine_name in (
      'digiy_verify_pin',
      'digiy_has_access',
      'digiy_has_module_access_from_abos'
    )
  )
order by routine_name, grantee;

-- 11. Résumé exploitable en une seule ligne.
select
  '11_RESUME' as section,

  to_regprocedure('public.digiy_verify_pin(text,text,text)') is not null
    as verify_pin_text_text_text,

  to_regprocedure('public.digiy_has_access(text,text)') is not null
    as has_access_text_text,

  to_regprocedure('public.digiy_has_module_access_from_abos(text,text)') is not null
    as abos_access_text_text,

  to_regprocedure('public.digiy_jobs_public_offers()') is not null
    as public_offers_rpc_present,

  to_regclass('public.digiy_jobs_offers_pro') is not null
    as offers_table_present,

  to_regclass('public.digiy_jobs_candidates_pro') is not null
    as candidates_table_present,

  coalesce((
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'digiy_jobs_offers_pro'
      and c.relkind in ('r','p')
    limit 1
  ), false) as offers_rls_enabled,

  coalesce((
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'digiy_jobs_candidates_pro'
      and c.relkind in ('r','p')
    limit 1
  ), false) as candidates_rls_enabled,

  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'fonction', p.proname,
        'parametres', pg_get_function_identity_arguments(p.oid),
        'resultat', pg_get_function_result(p.oid),
        'security_definer', p.prosecdef
      )
      order by p.proname, pg_get_function_identity_arguments(p.oid)
    )
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname ilike '%jobs%'
        or p.proname ilike '%candidate%'
        or p.proname ilike '%candidat%'
        or p.proname ilike '%application%'
      )
      and (
        p.proname ilike '%save%'
        or p.proname ilike '%create%'
        or p.proname ilike '%insert%'
        or p.proname ilike '%submit%'
        or p.proname ilike '%apply%'
        or p.proname ilike '%upsert%'
        or p.proname ilike '%status%'
      )
  ), '[]'::jsonb) as candidate_write_functions;

rollback;
