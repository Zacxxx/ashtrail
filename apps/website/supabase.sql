-- Run this once in Supabase SQL Editor for project twvtzbxhfibsvoesteek.

create extension if not exists pgcrypto;

create table if not exists public.player_characters (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    character_id text not null,
    name text not null,
    portrait_url text,
    portrait_path text,
    payload jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, character_id)
);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_player_characters_updated_at on public.player_characters;
create trigger trg_player_characters_updated_at
before update on public.player_characters
for each row
execute function public.set_updated_at_timestamp();

alter table public.player_characters enable row level security;

drop policy if exists "Users can read their own characters" on public.player_characters;
create policy "Users can read their own characters"
on public.player_characters
for select
using (auth.uid() = user_id);

drop policy if exists "Users can write their own characters" on public.player_characters;
create policy "Users can write their own characters"
on public.player_characters
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('public-assets', 'public-assets', true)
on conflict (id) do nothing;

drop policy if exists "Public can read character portraits" on storage.objects;
create policy "Public can read character portraits"
on storage.objects
for select
to public
using (bucket_id = 'public-assets' and (storage.foldername(name))[1] = 'characters');

drop policy if exists "Users can upload own character portraits" on storage.objects;
create policy "Users can upload own character portraits"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'public-assets'
    and (storage.foldername(name))[1] = 'characters'
    and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Users can update own character portraits" on storage.objects;
create policy "Users can update own character portraits"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'public-assets'
    and (storage.foldername(name))[1] = 'characters'
    and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
    bucket_id = 'public-assets'
    and (storage.foldername(name))[1] = 'characters'
    and (storage.foldername(name))[2] = auth.uid()::text
);

