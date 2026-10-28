create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb
    check (
      jsonb_typeof(content) = 'object'
      and content->>'type' = 'doc'
      and octet_length(content::text) <= 1000000
    ),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  shared_with_user_id uuid not null references auth.users (id) on delete cascade,
  permission text not null check (permission in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, shared_with_user_id)
);

create index documents_owner_updated_idx on public.documents (owner_id, updated_at desc);
create index document_shares_recipient_idx on public.document_shares (shared_with_user_id, document_id);
create index document_shares_document_idx on public.document_shares (document_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

create trigger document_shares_set_updated_at
before update on public.document_shares
for each row execute function public.set_updated_at();

create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(new.raw_user_meta_data->>'display_name', 80), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create function public.owns_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = target_document_id and d.owner_id = (select auth.uid())
  );
$$;

create function public.can_view_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.owns_document(target_document_id) or exists (
    select 1 from public.document_shares s
    where s.document_id = target_document_id
      and s.shared_with_user_id = (select auth.uid())
  );
$$;

create function public.can_edit_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.owns_document(target_document_id) or exists (
    select 1 from public.document_shares s
    where s.document_id = target_document_id
      and s.shared_with_user_id = (select auth.uid())
      and s.permission = 'editor'
  );
$$;

create function public.prevent_document_owner_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id <> old.owner_id then
    raise exception 'document_owner_is_immutable';
  end if;
  return new;
end;
$$;

create trigger documents_owner_immutable
before update of owner_id on public.documents
for each row execute function public.prevent_document_owner_change();

create function public.share_document_with_email(
  target_document_id uuid,
  recipient_email text,
  granted_permission text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
begin
  if not public.owns_document(target_document_id) then
    raise exception 'not_document_owner';
  end if;
  if granted_permission not in ('viewer', 'editor') then
    raise exception 'invalid_permission';
  end if;

  select u.id into recipient_id
  from auth.users u
  where lower(u.email) = lower(btrim(recipient_email));

  if recipient_id is null then
    raise exception 'recipient_not_found';
  end if;
  if recipient_id = (select auth.uid()) then
    raise exception 'cannot_share_with_self';
  end if;

  begin
    insert into public.document_shares (document_id, shared_with_user_id, permission)
    values (target_document_id, recipient_id, granted_permission);
  exception when unique_violation then
    raise exception 'already_shared';
  end;
end;
$$;

create function public.list_document_collaborators(target_document_id uuid)
returns table (user_id uuid, email text, display_name text, permission text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.owns_document(target_document_id) then
    raise exception 'not_document_owner';
  end if;

  return query
  select s.shared_with_user_id, u.email::text, p.display_name, s.permission
  from public.document_shares s
  join auth.users u on u.id = s.shared_with_user_id
  left join public.profiles p on p.id = s.shared_with_user_id
  where s.document_id = target_document_id
  order by s.created_at;
end;
$$;

create function public.get_document_owner_names(target_document_ids uuid[])
returns table (document_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, p.display_name
  from public.documents d
  left join public.profiles p on p.id = d.owner_id
  where d.id = any(target_document_ids)
    and public.can_view_document(d.id);
$$;

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_shares enable row level security;

create policy "Users can read their own profile"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy "Users can update their own profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "Owners and collaborators can read documents"
on public.documents for select to authenticated
using (public.can_view_document(id));

create policy "Users can create owned documents"
on public.documents for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy "Owners and editors can update documents"
on public.documents for update to authenticated
using (public.can_edit_document(id))
with check (public.can_edit_document(id));

create policy "Only owners can delete documents"
on public.documents for delete to authenticated
using (public.owns_document(id));

create policy "Users can see their shares and owners can see collaborators"
on public.document_shares for select to authenticated
using (shared_with_user_id = (select auth.uid()) or public.owns_document(document_id));

create policy "Only owners can create shares"
on public.document_shares for insert to authenticated
with check (
  public.owns_document(document_id)
  and shared_with_user_id <> (select auth.uid())
);

create policy "Only owners can update shares"
on public.document_shares for update to authenticated
using (public.owns_document(document_id))
with check (public.owns_document(document_id) and shared_with_user_id <> (select auth.uid()));

create policy "Only owners can remove shares"
on public.document_shares for delete to authenticated
using (public.owns_document(document_id));

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.document_shares to authenticated;

revoke all on function public.owns_document(uuid) from public;
revoke all on function public.can_view_document(uuid) from public;
revoke all on function public.can_edit_document(uuid) from public;
revoke all on function public.share_document_with_email(uuid, text, text) from public;
revoke all on function public.list_document_collaborators(uuid) from public;
revoke all on function public.get_document_owner_names(uuid[]) from public;
grant execute on function public.owns_document(uuid) to authenticated;
grant execute on function public.can_view_document(uuid) to authenticated;
grant execute on function public.can_edit_document(uuid) to authenticated;
grant execute on function public.share_document_with_email(uuid, text, text) to authenticated;
grant execute on function public.list_document_collaborators(uuid) to authenticated;
grant execute on function public.get_document_owner_names(uuid[]) to authenticated;
