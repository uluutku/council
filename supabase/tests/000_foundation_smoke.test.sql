begin;

select plan(2);

select has_extension('pgcrypto', 'pgcrypto extension is installed');
select has_extension('pg_trgm', 'pg_trgm extension is installed');

select * from finish();

rollback;
