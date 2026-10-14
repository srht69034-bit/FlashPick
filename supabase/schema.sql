-- =====================================================================
--  הדביקי את כל הקובץ ב-Supabase -> SQL Editor -> Run (פעם אחת)
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- טבלאות ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'photographer' check (role in ('photographer','client')),
  email text,
  full_name text
);

create table public.galleries (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  client_name text,
  client_email text not null,
  quota int not null default 30 check (quota > 0),
  status text not null default 'open' check (status in ('open','submitted')),
  page_notes jsonb not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  submitted_at timestamptz
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  path text not null,
  original_name text not null,
  position int not null default 0,
  selected boolean not null default false,
  album_page int,
  album_pos int,
  note text,
  created_at timestamptz not null default now()
);
create index photos_gallery_idx on public.photos(gallery_id);
create index galleries_expires_idx on public.galleries(expires_at);

-- ---------- פרופיל אוטומטי בהרשמה ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, role, email, full_name)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'role','photographer'),
          new.email,
          new.raw_user_meta_data->>'full_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- מכסת בחירה נאכפת בשרת (לא רק בדפדפן) ----------
create or replace function public.enforce_quota() returns trigger
language plpgsql security definer set search_path = public as $$
declare q int; c int;
begin
  if new.selected and not old.selected then
    select quota into q from galleries where id = new.gallery_id;
    select count(*) into c from photos where gallery_id = new.gallery_id and selected;
    if c >= q then raise exception 'quota exceeded'; end if;
  end if;
  return new;
end $$;
create trigger photos_quota before update on public.photos
  for each row execute function public.enforce_quota();

-- ---------- הערות עמודים (הלקוחה בלבד, רק כשהגלריה פתוחה) ----------
create or replace function public.set_page_notes(g uuid, n jsonb) returns void
language sql security definer set search_path = public as $$
  update galleries set page_notes = n
  where id = g and client_id = auth.uid() and status = 'open';
$$;
revoke execute on function public.set_page_notes(uuid, jsonb) from public, anon;
grant  execute on function public.set_page_notes(uuid, jsonb) to authenticated;

-- ---------- סטטיסטיקה לדשבורד ----------
create view public.gallery_stats with (security_invoker = true) as
  select g.id as gallery_id, count(p.id) as total,
         count(p.id) filter (where p.selected) as selected
  from public.galleries g left join public.photos p on p.gallery_id = g.id
  group by g.id;

-- ---------- Row Level Security ----------
alter table public.profiles  enable row level security;
alter table public.galleries enable row level security;
alter table public.photos    enable row level security;

create policy "profile: own"          on public.profiles  for select using (id = auth.uid());
create policy "gallery: photographer" on public.galleries for all
  using (photographer_id = auth.uid()) with check (photographer_id = auth.uid());
create policy "gallery: client read"  on public.galleries for select using (client_id = auth.uid());

create policy "photos: photographer" on public.photos for all
  using (exists (select 1 from public.galleries g where g.id = gallery_id and g.photographer_id = auth.uid()))
  with check (exists (select 1 from public.galleries g where g.id = gallery_id and g.photographer_id = auth.uid()));
create policy "photos: client read" on public.photos for select
  using (exists (select 1 from public.galleries g where g.id = gallery_id and g.client_id = auth.uid()));
create policy "photos: client update (open only)" on public.photos for update
  using (exists (select 1 from public.galleries g where g.id = gallery_id and g.client_id = auth.uid() and g.status = 'open'))
  with check (exists (select 1 from public.galleries g where g.id = gallery_id and g.client_id = auth.uid() and g.status = 'open'));

-- ---------- הרשאות ברמת עמודה + ניתוק מוחלט של משתמשים אנונימיים ----------
revoke update on public.photos from authenticated;
grant  update (selected, album_page, album_pos, note) on public.photos to authenticated;
revoke all on all tables in schema public from anon;

-- ---------- אחסון פרטי (Bucket לא ציבורי) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('galleries', 'galleries', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "storage: photographer upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'galleries' and exists (
    select 1 from public.galleries g
    where g.id::text = (storage.foldername(name))[1] and g.photographer_id = auth.uid()));

create policy "storage: owner or client read" on storage.objects for select to authenticated
  using (bucket_id = 'galleries' and exists (
    select 1 from public.galleries g
    where g.id::text = (storage.foldername(name))[1]
      and (g.photographer_id = auth.uid() or g.client_id = auth.uid())));

create policy "storage: photographer delete" on storage.objects for delete to authenticated
  using (bucket_id = 'galleries' and exists (
    select 1 from public.galleries g
    where g.id::text = (storage.foldername(name))[1] and g.photographer_id = auth.uid()));
