create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text not null unique check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  title text,
  direct_key text unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint chats_mode_title_check check (
    (is_group and title is not null and direct_key is null)
    or (not is_group and title is null and direct_key is not null)
  )
);

create table if not exists public.chat_members (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists chat_members_user_id_idx on public.chat_members(user_id);
create index if not exists messages_chat_created_idx on public.messages(chat_id, created_at);

create or replace function public.handle_new_juro_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phone is null then
    return new;
  end if;
  insert into public.profiles (id, phone, display_name)
  values (
    new.id,
    new.phone,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), new.phone)
  )
  on conflict (id) do update
  set phone = excluded.phone;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_juro on auth.users;
create trigger on_auth_user_created_juro
after insert on auth.users
for each row execute function public.handle_new_juro_user();

insert into public.profiles (id, phone, display_name)
select
  id,
  phone,
  coalesce(nullif(btrim(raw_user_meta_data ->> 'display_name'), ''), phone)
from auth.users
where phone is not null
on conflict (id) do update
set phone = excluded.phone;

create or replace function public.is_juro_chat_member(p_chat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_members m
    where m.chat_id = p_chat_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.create_direct_chat(p_phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_other_id uuid;
  v_direct_key text;
  v_chat_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in before starting a chat.';
  end if;
  if p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Enter a phone number in international format, for example +15551234567.';
  end if;

  select id into v_other_id from public.profiles where phone = p_phone;
  if v_other_id is null then
    raise exception 'No JURO account was found for that phone number.';
  end if;
  if v_other_id = v_user_id then
    raise exception 'You cannot start a chat with your own number.';
  end if;

  v_direct_key := least(v_user_id::text, v_other_id::text) || ':' ||
                  greatest(v_user_id::text, v_other_id::text);
  insert into public.chats (is_group, title, direct_key, created_by)
  values (false, null, v_direct_key, v_user_id)
  on conflict (direct_key) do update set direct_key = excluded.direct_key
  returning id into v_chat_id;

  insert into public.chat_members (chat_id, user_id)
  values (v_chat_id, v_user_id), (v_chat_id, v_other_id)
  on conflict do nothing;
  return v_chat_id;
end;
$$;

create or replace function public.create_group_chat(p_title text, p_phones text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_phones text[];
  v_found_count integer;
  v_chat_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in before creating a group.';
  end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 60 then
    raise exception 'Group name must be between 1 and 60 characters.';
  end if;
  if coalesce(cardinality(p_phones), 0) not between 1 and 100 then
    raise exception 'Add between 1 and 100 member phone numbers.';
  end if;
  if exists (
    select 1 from unnest(p_phones) as p(phone)
    where p.phone is null or p.phone !~ '^\+[1-9][0-9]{7,14}$'
  ) then
    raise exception 'Enter each member number in international format.';
  end if;

  select array_agg(distinct p.phone) into v_phones
  from unnest(p_phones) as p(phone);
  select count(*) into v_found_count
  from public.profiles
  where phone = any(v_phones);
  if v_found_count <> cardinality(v_phones) then
    raise exception 'One or more numbers do not have a JURO account yet.';
  end if;
  if not exists (
    select 1 from public.profiles
    where phone = any(v_phones) and id <> v_user_id
  ) then
    raise exception 'Add at least one other JURO user to the group.';
  end if;

  insert into public.chats (is_group, title, direct_key, created_by)
  values (true, btrim(p_title), null, v_user_id)
  returning id into v_chat_id;

  insert into public.chat_members (chat_id, user_id)
  select v_chat_id, id from public.profiles
  where id = v_user_id or phone = any(v_phones)
  on conflict do nothing;
  return v_chat_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Users can view their own or chat peers' profiles" on public.profiles;
create policy "Users can view their own or chat peers' profiles"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.chat_members cm
    where cm.user_id = profiles.id
      and public.is_juro_chat_member(cm.chat_id)
  )
);

drop policy if exists "Users can update their own display name" on public.profiles;
create policy "Users can update their own display name"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "Members can view their chats" on public.chats;
create policy "Members can view their chats"
on public.chats for select to authenticated
using (public.is_juro_chat_member(id));

drop policy if exists "Members can view chat membership" on public.chat_members;
create policy "Members can view chat membership"
on public.chat_members for select to authenticated
using (public.is_juro_chat_member(chat_id));

drop policy if exists "Members can view chat messages" on public.messages;
create policy "Members can view chat messages"
on public.messages for select to authenticated
using (public.is_juro_chat_member(chat_id));

drop policy if exists "Members can send messages as themselves" on public.messages;
create policy "Members can send messages as themselves"
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and public.is_juro_chat_member(chat_id)
);

revoke all on public.profiles, public.chats, public.chat_members, public.messages from anon, authenticated;
grant select on public.profiles, public.chats, public.chat_members, public.messages to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant insert (chat_id, sender_id, body) on public.messages to authenticated;

revoke all on function public.handle_new_juro_user() from public, anon, authenticated;
revoke all on function public.is_juro_chat_member(uuid) from public, anon;
revoke all on function public.create_direct_chat(text) from public, anon;
revoke all on function public.create_group_chat(text, text[]) from public, anon;
grant execute on function public.is_juro_chat_member(uuid) to authenticated;
grant execute on function public.create_direct_chat(text) to authenticated;
grant execute on function public.create_group_chat(text, text[]) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_members'
    ) then
      alter publication supabase_realtime add table public.chat_members;
    end if;
  end if;
end;
$$;
