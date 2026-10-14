# KONO NOTE 🎤

코인노래방에서 "뭐 부르지?" 할 때 꺼내 보는, 내가 불러본 노래 모음 앱.

- **전체**: 이름순(가나다 → ABC). 오른쪽 인덱스 바로 빠르게 이동해요.
- **가수**: 많이 부른 순(기본) 또는 가나다순. 눌러서 그 가수 노래만 볼 수 있어요.
- **장르**: 장르별로 모아 보기.
- **플리**: 내가 만든 플레이리스트. 오늘 부를 노래, 분위기별 묶음처럼 이름 붙여 모아두고 순서도 바꿀 수 있어요. 목록 오른쪽 버튼이나 노래 상세의 **플레이리스트에 담기**로 담아요. 아직 안 불러본 노래도 담을 수 있어요.
- **불렀어요**: 플리에 있는 안 불러본 노래를 부른 뒤 누르면, 확인을 거쳐 전체 노래에 저장돼요.
- **＋ 노래 추가 / ✏️ 수정**: 사이트에서 바로 추가하고 고쳐요. 앨범 사진은 검색해서 고를 수 있어요.
- **검색**: 띄어쓰기를 무시하고 초성 검색도 돼요 (`ㅅㄹ` → 사랑…).
- **🎲 뭐 부르지?**: 지금 보고 있는 목록에서 랜덤으로 추천해요.
- **PWA**: 홈 화면에 추가하면 앱처럼 실행돼요. 마지막으로 받은 목록은 오프라인에서도 보여요.

보기는 누구나 할 수 있고, 추가·수정은 로그인한 주인만 할 수 있어요.

## Supabase 설정 (처음 한 번)

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만들어요 (무료 플랜이면 충분해요).
2. **Authentication → Users → Add user → Create new user**에서 로그인에 쓸 이메일과 비밀번호로 계정을 만들어요. *Auto Confirm User*에 체크하세요.
3. **Authentication → Sign In / Providers**에서 *Allow new users to sign up*을 꺼요. 다른 사람이 가입하지 못하게 하는 설정이에요.
4. **SQL Editor**에서 [`supabase/schema.sql`](supabase/schema.sql)의 `OWNER_EMAIL` 4군데를 2번의 이메일로 바꾼 뒤 실행해요.
5. 이어서 [`supabase/seed.sql`](supabase/seed.sql)을 실행해요. 지금까지 불러본 노래 476곡이 들어가요.
   - 플레이리스트를 쓰려면 [`supabase/playlist.sql`](supabase/playlist.sql)도 실행해요. 주인 이메일은 4번에서 넣은 값을 그대로 가져와요.
   - 예전 찜·막곡·듀엣 노래는 [`supabase/playlist_move.sql`](supabase/playlist_move.sql)을 한 번 실행하면 같은 이름의 플리로 옮겨져요.
6. 아래 두 값을 복사해 [`config.js`](config.js)에 넣어요.
   - **Project URL** (`https://xxxx.supabase.co`): 프로젝트 첫 화면 위쪽 **Connect** 버튼, 또는 **Project Settings → Data API**에 있어요.
     못 찾으면 **Project Settings → General**의 *Project ID*로 `https://<Project ID>.supabase.co`를 만들면 돼요.
   - **공개용 키**: **Project Settings → API Keys**의 *Publishable key* (`sb_publishable_...`)를 써요.
     *Legacy API Keys* 탭의 *anon public* 키(`eyJ...`)도 돼요.
   - ⚠️ *Secret key* (`sb_secret_...`)나 *service_role* 키는 절대 넣지 마세요.
     권한 검사를 무시하는 관리자 키라서, 공개되면 누구나 DB를 바꿀 수 있어요. 실수로 올렸다면 같은 화면에서 바로 재발급하세요.
7. 사이트 오른쪽 위 👤 → 로그인. 한 번 로그인하면 그 기기에서는 계속 유지돼요.

## 폰에 설치하기

- **아이폰 (Safari)**: 사이트 접속 → 공유 버튼 → *홈 화면에 추가*
  - 로그인은 홈 화면 앱에서 하세요. Safari와 홈 화면 앱은 로그인 상태를 따로 저장해요.
- **안드로이드 (Chrome)**: 사이트 접속 → 하단 *설치* 버튼, 또는 메뉴(⋮) → *앱 설치*

## 파일 구성

| 파일 | 내용 |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | 앱 본체 |
| `config.js` | Supabase 연결 정보 |
| `data/songs.js` | 서버 연결 전이나 첫 접속 때 보여줄 기본 목록 |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA (오프라인 캐시, 설치) |
| `supabase/` | 테이블·권한 SQL, 초기 데이터 |

앱 파일을 고친 뒤 `sw.js`의 `VERSION`과 `index.html`의 `?v=` 숫자를 같이 올리면, 설치된 앱에도 바로 반영돼요.

앨범 사진과 앨범 정보는 iTunes Search API에서 가져와요.
