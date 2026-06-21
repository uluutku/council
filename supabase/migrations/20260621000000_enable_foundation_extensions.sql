create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

comment on extension pgcrypto is 'Cryptographic functions used by future Council migrations.';
comment on extension pg_trgm is 'Trigram matching used by future search features.';
