-- KONO NOTE 테이블 + 권한 설정
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
-- ⚠️ 아래 'OWNER_EMAIL' 을 로그인에 쓸 본인 이메일로 바꾼 뒤 실행하세요. (4군데)

create table if not exists public.songs (
  id         bigint generated always as identity primary key,
  title      text not null,
  artist     text not null,
  genre      text not null default '발라드',
  art        text,
  album      text,
  year       text,
  sung       boolean not null default true,   -- 불러봤음 → 전체 목록에 표시
  fav        boolean not null default false,  -- 찜
  last_song  boolean not null default false,  -- 막곡
  sung_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (title, artist)
);

alter table public.songs enable row level security;

grant select on public.songs to anon, authenticated;
grant insert, update, delete on public.songs to authenticated;

drop policy if exists "누구나 읽기" on public.songs;
drop policy if exists "주인만 추가" on public.songs;
drop policy if exists "주인만 수정" on public.songs;
drop policy if exists "주인만 삭제" on public.songs;

create policy "누구나 읽기" on public.songs
  for select to anon, authenticated using (true);

create policy "주인만 추가" on public.songs
  for insert to authenticated
  with check ((auth.jwt() ->> 'email') = 'OWNER_EMAIL');

create policy "주인만 수정" on public.songs
  for update to authenticated
  using ((auth.jwt() ->> 'email') = 'OWNER_EMAIL')
  with check ((auth.jwt() ->> 'email') = 'OWNER_EMAIL');

create policy "주인만 삭제" on public.songs
  for delete to authenticated
  using ((auth.jwt() ->> 'email') = 'OWNER_EMAIL');
