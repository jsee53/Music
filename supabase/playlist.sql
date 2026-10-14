-- 플레이리스트 테이블. SQL Editor 에서 한 번 실행하세요.
-- 주인 이메일은 schema.sql 때 넣은 값을 songs 테이블 권한에서 그대로 가져와요. (따로 바꿀 곳 없음)

do $do$
declare owner text;
begin
  select substring(with_check from '=\s*''([^'']+)''') into owner
  from pg_policies where schemaname = 'public' and tablename = 'songs' and policyname = '주인만 추가';
  if owner is null or owner = 'OWNER_EMAIL' then
    raise exception 'songs 테이블의 주인 이메일을 못 찾았어요. schema.sql 을 먼저 실행해 주세요.';
  end if;
  execute format($f$create or replace function public.kono_is_owner() returns boolean
    language sql stable as $b$ select coalesce(auth.jwt() ->> 'email', '') = %L $b$$f$, owner);
end $do$;

create table if not exists public.playlists (
  id         bigint generated always as identity primary key,
  name       text not null,
  position   int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.playlist_songs (
  playlist_id bigint not null references public.playlists(id) on delete cascade,
  song_id     bigint not null references public.songs(id) on delete cascade,
  position    int not null default 0,
  added_at    timestamptz not null default now(),
  primary key (playlist_id, song_id)
);

alter table public.playlists enable row level security;
alter table public.playlist_songs enable row level security;

grant select on public.playlists, public.playlist_songs to anon, authenticated;
grant insert, update, delete on public.playlists, public.playlist_songs to authenticated;

drop policy if exists "누구나 읽기" on public.playlists;
drop policy if exists "주인만 추가" on public.playlists;
drop policy if exists "주인만 수정" on public.playlists;
drop policy if exists "주인만 삭제" on public.playlists;
drop policy if exists "누구나 읽기" on public.playlist_songs;
drop policy if exists "주인만 추가" on public.playlist_songs;
drop policy if exists "주인만 수정" on public.playlist_songs;
drop policy if exists "주인만 삭제" on public.playlist_songs;

create policy "누구나 읽기" on public.playlists for select to anon, authenticated using (true);
create policy "주인만 추가" on public.playlists for insert to authenticated with check (public.kono_is_owner());
create policy "주인만 수정" on public.playlists for update to authenticated using (public.kono_is_owner()) with check (public.kono_is_owner());
create policy "주인만 삭제" on public.playlists for delete to authenticated using (public.kono_is_owner());

create policy "누구나 읽기" on public.playlist_songs for select to anon, authenticated using (true);
create policy "주인만 추가" on public.playlist_songs for insert to authenticated with check (public.kono_is_owner());
create policy "주인만 수정" on public.playlist_songs for update to authenticated using (public.kono_is_owner()) with check (public.kono_is_owner());
create policy "주인만 삭제" on public.playlist_songs for delete to authenticated using (public.kono_is_owner());
