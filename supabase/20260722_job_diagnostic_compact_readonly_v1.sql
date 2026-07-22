begin transaction read only;

set local statement_timeout = '30s';

-- DIGIY PRO JOB — DIAGNOSTIC COMPACT V1 — LECTURE SEULE
-- Aucun téléphone, PIN, nom, slug ou profil d’abonné.
-- Aucune création, modification ou suppression.
-- Une seule ligne finale contient tout le diagnostic utile.

with
functions as (
  select jsonb_agg(
    jsonb_build_object(
      'name', p.proname,
      'args', pg_get_function_identity_arguments(p.oid),
      'result', pg_get_function_result(p.oid),
      'security_definer', p.prosecdef,
      'volatility', p.provolatile
    )
    order by p.proname, pg_get_function_identity_arguments(p.oid)
  ) as value
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (
      p.proname ilike '%jobs%'
      or p.proname ilike '%candidate%'
      or p.proname ilike '%offer%'
      or p.proname ilike '%application%'
      or p.proname ilike '%apply%'
      or p.proname ilike '%submit%'
      or p.proname ilike '%recruit%'
      or p.proname in (
        'digiy_verify_pin',
        'digiy_has_access',
        'digiy_has_module_access_from_abos'
      )
    )
),
relations as (
  select jsonb_agg(
    jsonb_build_object(
      'name', c.relname,
      'type', case c.relkind
        when 'r' then 'table'
        when 'p' then 'partitioned_table'
        when 'v' then 'view'
        when 'm' then 'materialized_view'
        else c.relkind::text
      end,
      'rls', c.relrowsecurity,
      'force_rls', c.relforcerowsecurity
    )
    order by c.relname
  ) as value
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r','p','v','m')
    and (
      c.relname ilike '%jobs%'
      or c.relname ilike '%candidate%'
      or c.relname ilike '%offer%'
      or c.relname ilike '%application%'
      or c.relname ilike '%recruit%'
    )
),
columns_data as (
  select jsonb_agg(
    jsonb_build_object(
      'table', table_name,
      'position', ordinal_position,
      'column', column_name,
      'type', data_type,
      'udt', udt_name,
      'nullable', is_nullable,
      'default', column_default
    )
    order by table_name, ordinal_position
  ) as value
  from information_schema.columns
  where table_schema = 'public'
    and (
      table_name ilike '%jobs%'
      or table_name ilike '%candidate%'
      or table_name ilike '%offer%'
      or table_name ilike '%application%'
      or table_name ilike '%recruit%'
    )
),
constraints_data as (
  select jsonb_agg(
    jsonb_build_object(
      'table', rel.relname,
      'name', con.conname,
      'type', con.contype,
      'definition', pg_get_constraintdef(con.oid, true)
    )
    order by rel.relname, con.conname
  ) as value
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'
    and (
      rel.relname ilike '%jobs%'
      or rel.relname ilike '%candidate%'
      or rel.relname ilike '%offer%'
      or rel.relname ilike '%application%'
      or rel.relname ilike '%recruit%'
    )
),
policies_data as (
  select jsonb_agg(
    jsonb_build_object(
      'table', tablename,
      'policy', policyname,
      'roles', roles,
      'command', cmd,
      'using', qual,
      'check', with_check
    )
    order by tablename, policyname
  ) as value
  from pg_policies
  where schemaname = 'public'
    and (
      tablename ilike '%jobs%'
      or tablename ilike '%candidate%'
      or tablename ilike '%offer%'
      or tablename ilike '%application%'
      or tablename ilike '%recruit%'
    )
),
grants_data as (
  select jsonb_agg(
    jsonb_build_object(
      'grantee', grantee,
      'table', table_name,
      'privilege', privilege_type
    )
    order by table_name, grantee, privilege_type
  ) as value
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon','authenticated','public')
    and (
      table_name ilike '%jobs%'
      or table_name ilike '%candidate%'
      or table_name ilike '%offer%'
      or table_name ilike '%application%'
      or table_name ilike '%recruit%'
    )
),
summary as (
  select jsonb_build_object(
    'verify_pin', to_regprocedure('public.digiy_verify_pin(text,text,text)') is not null,
    'has_access', to_regprocedure('public.digiy_has_access(text,text)') is not null,
    'abos_access', to_regprocedure('public.digiy_has_module_access_from_abos(text,text)') is not null,
    'public_offers_rpc', to_regprocedure('public.digiy_jobs_public_offers()') is not null,
    'offers_table', to_regclass('public.digiy_jobs_offers_pro') is not null,
    'candidates_table', to_regclass('public.digiy_jobs_candidates_pro') is not null,
    'candidate_submit_rpc_found', exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and (
          p.proname ilike '%candidate%'
          or p.proname ilike '%application%'
          or p.proname ilike '%apply%'
          or p.proname ilike '%submit%'
        )
        and (
          p.proname ilike '%create%'
          or p.proname ilike '%save%'
          or p.proname ilike '%insert%'
          or p.proname ilike '%submit%'
          or p.proname ilike '%apply%'
          or p.proname ilike '%upsert%'
        )
    )
  ) as value
)
select
  '12_DIAGNOSTIC_COMPACT' as section,
  summary.value as resume,
  coalesce(functions.value, '[]'::jsonb) as fonctions,
  coalesce(relations.value, '[]'::jsonb) as relations,
  coalesce(columns_data.value, '[]'::jsonb) as colonnes,
  coalesce(constraints_data.value, '[]'::jsonb) as contraintes,
  coalesce(policies_data.value, '[]'::jsonb) as politiques_rls,
  coalesce(grants_data.value, '[]'::jsonb) as droits
from summary, functions, relations, columns_data, constraints_data, policies_data, grants_data;

rollback;
