begin;

select plan(61);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'contacts-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'contacts-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('30000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'contacts-c@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('40000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'contacts-d@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('50000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'contacts-e@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles
set
  username = case id
    when '10000000-0000-0000-0000-000000000001' then 'alice'
    when '20000000-0000-0000-0000-000000000002' then 'boris'
    when '30000000-0000-0000-0000-000000000003' then 'carol'
    when '40000000-0000-0000-0000-000000000004' then 'daria'
    when '50000000-0000-0000-0000-000000000005' then 'emre'
  end,
  display_name = case id
    when '10000000-0000-0000-0000-000000000001' then 'Alice'
    when '20000000-0000-0000-0000-000000000002' then 'Boris'
    when '30000000-0000-0000-0000-000000000003' then 'Carol'
    when '40000000-0000-0000-0000-000000000004' then 'Daria'
    when '50000000-0000-0000-0000-000000000005' then 'Emre'
  end
where true;

insert into public.contact_relationships (
  id,
  user_low_id,
  user_high_id,
  requested_by,
  status
)
values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  '20000000-0000-0000-0000-000000000002',
  '50000000-0000-0000-0000-000000000005',
  '20000000-0000-0000-0000-000000000002',
  'pending'
);

set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
set local role authenticated;

select is(
  (public.send_contact_request('20000000-0000-0000-0000-000000000002')).status,
  'pending',
  'a user can send a valid contact request'
);
select ok(
  exists (
    select 1
    from public.contact_relationships
    where user_low_id = '10000000-0000-0000-0000-000000000001'
      and user_high_id = '20000000-0000-0000-0000-000000000002'
  ),
  'contact requests store the canonical user pair'
);
select is(
  (
    public.send_contact_request('20000000-0000-0000-0000-000000000002')
  ).id,
  (
    select id
    from public.contact_relationships
    where user_low_id = '10000000-0000-0000-0000-000000000001'
      and user_high_id = '20000000-0000-0000-0000-000000000002'
  ),
  'a duplicate same-direction request is idempotent'
);
select is(
  (
    select count(*)::integer
    from public.contact_relationships
    where user_low_id = '10000000-0000-0000-0000-000000000001'
      and user_high_id = '20000000-0000-0000-0000-000000000002'
  ),
  1,
  'idempotent requests do not create duplicate rows'
);
select is(
  (
    select direction
    from public.list_my_contact_requests()
    where id = '20000000-0000-0000-0000-000000000002'
  ),
  'outgoing',
  'the requester sees an outgoing pending request'
);
select is(
  (
    select count(*)::integer
    from public.profiles
    where id = '20000000-0000-0000-0000-000000000002'
  ),
  1,
  'pending participants can directly select each other profiles'
);

reset role;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000003';
set local role authenticated;

select is(
  (
    select count(*)::integer
    from public.contact_relationships
    where user_low_id = '10000000-0000-0000-0000-000000000001'
      and user_high_id = '20000000-0000-0000-0000-000000000002'
  ),
  0,
  'an unrelated user cannot read a relationship'
);
select throws_ok(
  $$
    select public.respond_contact_request(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'accepted'
    )
  $$,
  '42501',
  'only a request participant may respond',
  'an unrelated user cannot respond even when a relationship id is known'
);

reset role;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
set local role authenticated;

select throws_ok(
  $$
    select public.respond_contact_request(
      (
        select id
        from public.contact_relationships
        where user_low_id = '10000000-0000-0000-0000-000000000001'
          and user_high_id = '20000000-0000-0000-0000-000000000002'
      ),
      'accepted'
    )
  $$,
  '42501',
  'the requester cannot respond to their own request',
  'a requester cannot accept their own request'
);

reset role;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000002';
set local role authenticated;

select is(
  (
    select direction
    from public.list_my_contact_requests()
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'incoming',
  'the recipient sees an incoming pending request'
);
select is(
  (
    public.respond_contact_request(
      (
        select id
        from public.contact_relationships
        where user_low_id = '10000000-0000-0000-0000-000000000001'
          and user_high_id = '20000000-0000-0000-0000-000000000002'
      ),
      'accepted'
    )
  ).status,
  'accepted',
  'the recipient can accept a pending request'
);
select ok(
  (
    select responded_at is not null
    from public.contact_relationships
    where user_low_id = '10000000-0000-0000-0000-000000000001'
      and user_high_id = '20000000-0000-0000-0000-000000000002'
  ),
  'acceptance records a response time'
);
select is(
  (
    select count(*)::integer
    from public.list_my_contacts()
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  1,
  'an accepted contact appears in the recipient contact list'
);
select is(
  (
    select relationship_id
    from public.list_my_contacts()
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  (
    select id
    from public.contact_relationships
    where user_low_id = '10000000-0000-0000-0000-000000000001'
      and user_high_id = '20000000-0000-0000-0000-000000000002'
  ),
  'contact list entries include their relationship id'
);
select throws_ok(
  $$
    select public.respond_contact_request(
      (
        select id
        from public.contact_relationships
        where user_low_id = '10000000-0000-0000-0000-000000000001'
          and user_high_id = '20000000-0000-0000-0000-000000000002'
      ),
      'accepted'
    )
  $$,
  '22023',
  'only pending contact requests can be answered',
  'an accepted relationship cannot be answered again'
);

reset role;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
set local role authenticated;

select is(
  (
    select count(*)::integer
    from public.list_my_contacts()
    where id = '20000000-0000-0000-0000-000000000002'
  ),
  1,
  'an accepted contact appears in the requester contact list'
);
select ok(
  (
    select not (to_jsonb(contact_result) ? 'email')
    from public.list_my_contacts() as contact_result
    where id = '20000000-0000-0000-0000-000000000002'
  ),
  'contact lists do not expose email addresses'
);

reset role;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000002';
set local role authenticated;

select ok(
  public.remove_contact('10000000-0000-0000-0000-000000000001'),
  'either accepted participant may remove a contact'
);
select is(
  (
    select count(*)::integer
    from public.contact_relationships
    where user_low_id = '10000000-0000-0000-0000-000000000001'
      and user_high_id = '20000000-0000-0000-0000-000000000002'
  ),
  0,
  'contact removal deletes the canonical relationship'
);
select ok(
  not public.remove_contact('10000000-0000-0000-0000-000000000001'),
  'contact removal is idempotent'
);

reset role;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
set local role authenticated;

select throws_ok(
  $$ select public.send_contact_request('10000000-0000-0000-0000-000000000001') $$,
  '22023',
  'a contact request must target another user',
  'a user cannot request themselves'
);
select throws_ok(
  $$ select public.send_contact_request('99999999-9999-4999-8999-999999999999') $$,
  'P0002',
  'target user not found',
  'a contact request cannot target a nonexistent user'
);
select is(
  (public.send_contact_request('30000000-0000-0000-0000-000000000003')).status,
  'pending',
  'a second valid request can be created'
);
select throws_ok(
  $$
    select public.respond_contact_request(
      (
        select id
        from public.contact_relationships
        where user_low_id = '10000000-0000-0000-0000-000000000001'
          and user_high_id = '30000000-0000-0000-0000-000000000003'
      ),
      'ignored'
    )
  $$,
  '22023',
  'response must be accepted or rejected',
  'contact request responses reject unknown values'
);

reset role;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000003';
set local role authenticated;

select is(
  (
    public.respond_contact_request(
      (
        select id
        from public.contact_relationships
        where user_low_id = '10000000-0000-0000-0000-000000000001'
          and user_high_id = '30000000-0000-0000-0000-000000000003'
      ),
      'rejected'
    )
  ).status,
  'rejected',
  'the recipient can reject a pending request'
);
select ok(
  (
    select responded_at is not null
    from public.contact_relationships
    where user_low_id = '10000000-0000-0000-0000-000000000001'
      and user_high_id = '30000000-0000-0000-0000-000000000003'
  ),
  'rejection records a response time'
);

reset role;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
set local role authenticated;

select is(
  (
    select count(*)::integer
    from public.list_my_contacts()
    where id = '30000000-0000-0000-0000-000000000003'
  ),
  0,
  'rejected relationships do not appear as contacts'
);
select is(
  (public.send_contact_request('30000000-0000-0000-0000-000000000003')).status,
  'pending',
  'a rejected relationship may be requested again'
);
select is(
  (
    select requested_by
    from public.contact_relationships
    where user_low_id = '10000000-0000-0000-0000-000000000001'
      and user_high_id = '30000000-0000-0000-0000-000000000003'
  ),
  '10000000-0000-0000-0000-000000000001'::uuid,
  'retrying a rejected relationship records the new requester'
);
select is(
  (public.send_contact_request('40000000-0000-0000-0000-000000000004')).status,
  'pending',
  'a pending request can be created for reciprocal acceptance'
);

reset role;
set local request.jwt.claim.sub = '40000000-0000-0000-0000-000000000004';
set local role authenticated;

select is(
  (public.send_contact_request('10000000-0000-0000-0000-000000000001')).status,
  'accepted',
  'a reciprocal pending request is accepted automatically'
);
select is(
  (
    select requested_by
    from public.contact_relationships
    where user_low_id = '10000000-0000-0000-0000-000000000001'
      and user_high_id = '40000000-0000-0000-0000-000000000004'
  ),
  '10000000-0000-0000-0000-000000000001'::uuid,
  'automatic reciprocal acceptance preserves the original requester'
);
select is(
  (public.send_contact_request('10000000-0000-0000-0000-000000000001')).status,
  'accepted',
  'requesting an existing contact returns the accepted relationship'
);

reset role;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000002';
set local role authenticated;

select is(
  (public.send_contact_request('30000000-0000-0000-0000-000000000003')).status,
  'pending',
  'a pending relationship exists before blocking'
);
select ok(
  public.block_user('30000000-0000-0000-0000-000000000003'),
  'a user can block another user'
);
select ok(
  public.block_user('30000000-0000-0000-0000-000000000003'),
  'blocking the same user again is idempotent'
);
select is(
  (
    select count(*)::integer
    from public.user_blocks
    where blocker_id = '20000000-0000-0000-0000-000000000002'
      and blocked_id = '30000000-0000-0000-0000-000000000003'
  ),
  1,
  'the blocker can read their own block row'
);
select is(
  (
    select count(*)::integer
    from public.contact_relationships
    where user_low_id = '20000000-0000-0000-0000-000000000002'
      and user_high_id = '30000000-0000-0000-0000-000000000003'
  ),
  0,
  'blocking transactionally removes a pending relationship'
);

reset role;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000003';
set local role authenticated;

select is(
  (select count(*)::integer from public.user_blocks),
  0,
  'the blocked user cannot query whether they were blocked'
);
select throws_ok(
  $$ select public.send_contact_request('20000000-0000-0000-0000-000000000002') $$,
  '42501',
  'contact request is not allowed',
  'blocking prevents a contact request from the blocked user'
);
select is(
  (
    select count(*)::integer
    from public.profiles
    where id = '20000000-0000-0000-0000-000000000002'
  ),
  0,
  'the blocked user cannot directly select the blocker profile'
);
select is(
  (select count(*)::integer from public.search_profiles('boris', 20)),
  0,
  'the blocked user cannot discover the blocker through search'
);

reset role;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000002';
set local role authenticated;

select throws_ok(
  $$ select public.send_contact_request('30000000-0000-0000-0000-000000000003') $$,
  '42501',
  'contact request is not allowed',
  'blocking prevents a contact request from the blocker'
);
select is(
  (
    select count(*)::integer
    from public.profiles
    where id = '30000000-0000-0000-0000-000000000003'
  ),
  0,
  'the blocker cannot directly select the blocked profile'
);
select is(
  (select count(*)::integer from public.search_profiles('carol', 20)),
  0,
  'the blocker cannot discover the blocked user through search'
);
select throws_ok(
  $$ select public.block_user('20000000-0000-0000-0000-000000000002') $$,
  '22023',
  'a block must target another user',
  'a user cannot block themselves'
);
select ok(
  public.unblock_user('30000000-0000-0000-0000-000000000003'),
  'the blocker can unblock the user'
);
select ok(
  public.unblock_user('30000000-0000-0000-0000-000000000003'),
  'unblocking is idempotent'
);
select is(
  (
    select count(*)::integer
    from public.user_blocks
    where blocker_id = '20000000-0000-0000-0000-000000000002'
      and blocked_id = '30000000-0000-0000-0000-000000000003'
  ),
  0,
  'unblocking removes only the blocker row'
);
select is(
  (
    select count(*)::integer
    from public.contact_relationships
    where user_low_id = '20000000-0000-0000-0000-000000000002'
      and user_high_id = '30000000-0000-0000-0000-000000000003'
  ),
  0,
  'unblocking does not restore a pending relationship'
);

reset role;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
set local role authenticated;

select ok(
  public.block_user('40000000-0000-0000-0000-000000000004'),
  'blocking an accepted contact succeeds'
);
select is(
  (
    select count(*)::integer
    from public.contact_relationships
    where user_low_id = '10000000-0000-0000-0000-000000000001'
      and user_high_id = '40000000-0000-0000-0000-000000000004'
  ),
  0,
  'blocking transactionally removes an accepted relationship'
);
select is(
  (
    select count(*)::integer
    from public.list_my_contacts()
    where id = '40000000-0000-0000-0000-000000000004'
  ),
  0,
  'a blocked former contact is excluded from contact lists'
);

reset role;
set local request.jwt.claim.sub = '40000000-0000-0000-0000-000000000004';
set local role authenticated;

select throws_ok(
  $$ select public.send_contact_request('10000000-0000-0000-0000-000000000001') $$,
  '42501',
  'contact request is not allowed',
  'the blocked former contact cannot recreate the relationship'
);

reset role;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
set local role authenticated;

select ok(
  public.unblock_user('40000000-0000-0000-0000-000000000004'),
  'the accepted former contact can be unblocked'
);
select is(
  (
    select count(*)::integer
    from public.contact_relationships
    where user_low_id = '10000000-0000-0000-0000-000000000001'
      and user_high_id = '40000000-0000-0000-0000-000000000004'
  ),
  0,
  'unblocking does not restore an accepted relationship'
);

reset role;

update public.user_settings
set privacy_preferences = '{"allow_contact_requests": false}'::jsonb
where user_id = '50000000-0000-0000-0000-000000000005';

set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
set local role authenticated;

select throws_ok(
  $$ select public.send_contact_request('50000000-0000-0000-0000-000000000005') $$,
  '42501',
  'target user does not allow contact requests',
  'a contact request respects the target privacy setting'
);

reset role;

update public.user_settings
set privacy_preferences = '{"allow_contact_requests": "not-a-boolean"}'::jsonb
where user_id = '50000000-0000-0000-0000-000000000005';

set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
set local role authenticated;

select throws_ok(
  $$ select public.send_contact_request('50000000-0000-0000-0000-000000000005') $$,
  '42501',
  'target user does not allow contact requests',
  'missing or malformed contact-request privacy values fail closed'
);

reset role;

update public.user_settings
set privacy_preferences = '{"allow_contact_requests": true}'::jsonb
where user_id = '50000000-0000-0000-0000-000000000005';

set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
set local role authenticated;

select is(
  (public.send_contact_request('50000000-0000-0000-0000-000000000005')).status,
  'pending',
  'a requester can create a relationship used to test removal from their side'
);

reset role;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000005';
set local role authenticated;

select is(
  (
    public.respond_contact_request(
      (
        select id
        from public.contact_relationships
        where user_low_id = '10000000-0000-0000-0000-000000000001'
          and user_high_id = '50000000-0000-0000-0000-000000000005'
      ),
      'accepted'
    )
  ).status,
  'accepted',
  'a second relationship can be accepted'
);

reset role;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
set local role authenticated;

select ok(
  public.remove_contact('50000000-0000-0000-0000-000000000005'),
  'the original requester may also remove an accepted contact'
);

select * from finish();

rollback;
