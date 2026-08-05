with admin_tables as (
  select format(
    '%s.%s:%s:%s',
    namespace.nspname,
    relation.relname,
    relation.relrowsecurity,
    relation.relforcerowsecurity
  ) as value
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname in ('public', 'private')
    and relation.relname like 'admin_%'
), admin_policies as (
  select format(
    '%s.%s:%s:%s:%s:%s:%s',
    schemaname,
    tablename,
    policyname,
    roles,
    cmd,
    qual,
    with_check
  ) as value
  from pg_catalog.pg_policies
  where schemaname in ('public', 'private')
    and tablename like 'admin_%'
), admin_grants as (
  select format(
    '%s.%s:%s:%s',
    table_schema,
    table_name,
    grantee,
    privilege_type
  ) as value
  from information_schema.role_table_grants
  where table_schema in ('public', 'private')
    and table_name like 'admin_%'
), admin_functions as (
  select pg_catalog.pg_get_functiondef(procedure.oid) as value
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname in ('public', 'private')
    and procedure.proname like 'admin\_%' escape '\'
), fingerprint_rows as (
  select value from admin_tables
  union all select value from admin_policies
  union all select value from admin_grants
  union all select value from admin_functions
)
select pg_catalog.md5(coalesce(string_agg(value, '|' order by value), '')) as admin_schema_fingerprint
from fingerprint_rows;
