-- 찜·막곡·듀엣에 담겨 있던 노래를 같은 이름의 플레이리스트로 옮겨요.
-- playlist.sql 을 실행한 다음, SQL Editor 에서 딱 한 번 실행하세요.
-- (다시 실행하면 지운 '찜'·'막곡'·'듀엣' 플리가 되살아나요.)
-- songs 의 fav / last_song / duet 칸은 지우지 않고 그대로 둬요. 앱에서는 더 이상 안 써요.

do $do$
declare
  r record;
  pid bigint;
  has boolean;
begin
  for r in select * from (values ('찜', 'fav', 0), ('막곡', 'last_song', 1), ('듀엣', 'duet', 2)) v(name, col, pos) loop
    -- duet 칸이 없으면(duet.sql 안 돌린 경우) 건너뛰어요
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'songs' and column_name = r.col) then
      continue;
    end if;
    execute format('select exists (select 1 from public.songs where %I)', r.col) into has;
    if not has then continue; end if;

    select id into pid from public.playlists where name = r.name order by id limit 1;
    if pid is null then
      insert into public.playlists (name, position) values (r.name, r.pos) returning id into pid;
    end if;

    -- 안 불러본 노래 먼저, 그다음 제목순
    execute format($q$
      insert into public.playlist_songs (playlist_id, song_id, position)
      select %s, id, (row_number() over (order by sung, title))::int - 1 from public.songs where %I
      on conflict do nothing
    $q$, pid, r.col);
  end loop;
end $do$;
