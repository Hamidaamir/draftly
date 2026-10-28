alter table public.documents
alter column owner_id set default auth.uid();
