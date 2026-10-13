-- 듀엣곡 탭용 칸 추가. SQL Editor 에서 한 번 실행하세요.
alter table public.songs add column if not exists duet boolean not null default false;

-- (선택) 가수가 여럿인 노래(& 로 이어진 곡)를 듀엣곡으로 미리 담고 싶으면 아래 줄의 -- 를 지우고 실행하세요.
-- update public.songs set duet = true where artist like '%&%';
