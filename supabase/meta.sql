-- 앱 정보 테이블 (마지막 노래 업데이트 날짜)
-- SQL Editor 에서 'OWNER_EMAIL' 을 schema.sql 때와 같은 이메일로 바꾼 뒤 한 번 실행하세요. (3군데)

create table if not exists public.meta (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.meta enable row level security;

grant select on public.meta to anon, authenticated;
grant insert, update on public.meta to authenticated;

drop policy if exists "누구나 읽기" on public.meta;
drop policy if exists "주인만 추가" on public.meta;
drop policy if exists "주인만 수정" on public.meta;

create policy "누구나 읽기" on public.meta
  for select to anon, authenticated using (true);

create policy "주인만 추가" on public.meta
  for insert to authenticated
  with check ((auth.jwt() ->> 'email') = 'OWNER_EMAIL');

create policy "주인만 수정" on public.meta
  for update to authenticated
  using ((auth.jwt() ->> 'email') = 'OWNER_EMAIL')
  with check ((auth.jwt() ->> 'email') = 'OWNER_EMAIL');

insert into public.meta (key, value) values ('last_update', '2026-10-13')
on conflict (key) do nothing;
