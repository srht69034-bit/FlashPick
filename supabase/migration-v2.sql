-- הרצה חד-פעמית ב-SQL Editor, אם כבר הרצת את schema.sql הישן
alter table public.photos add column if not exists rejected boolean not null default false;
alter table public.photos add column if not exists w int;
alter table public.photos add column if not exists h int;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables    in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;

revoke update on public.photos from authenticated;
grant  update (selected, rejected, album_page, album_pos, note) on public.photos to authenticated;
revoke all on all tables in schema public from anon;
