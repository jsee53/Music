// Supabase 연결 설정 — 넣는 방법은 README.md 의 'Supabase 설정' 6번 참고.
// anon(publishable) 키는 공개돼도 괜찮은 키예요. 수정 권한은 RLS 정책(supabase/schema.sql)으로 막혀 있어요.
// service_role(secret) 키는 절대 여기에 넣지 마세요.
window.KONO_CONFIG = {
  supabaseUrl: 'https://irgwlfjslzbdlzvjutgv.supabase.co',
  supabaseAnonKey: 'sb_publishable_V0ZOW3LSc18-XFUpA4ObyA_mvcc4fxy',
};
