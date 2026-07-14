# Synthesis

> 제품의 현재 목적·출력 형식·사용 장면은 [`PRODUCT_DEFINITION.md`](./PRODUCT_DEFINITION.md)에 정리되어 있습니다.

흩어진 아이디어를 비대면·비동기로 쌓아두고, **돌려보기**를 누르면 Claude가 입력
어느 것과도 같지 않은 **N+1번째 결론(한 문장 X)** 을 합성해주는 회의 도구.
selection이 아니라 synthesis. AI가 합성을 대체하지 않고 증폭한다.

스택: **Next.js 16 (App Router, TS) · Supabase(Postgres/Realtime/Auth) · Anthropic Claude · Tailwind + shadcn/ui · Vercel**

---

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # 값 채우기 (아래 참고)
npm run dev                  # http://localhost:3000
```

## 필요한 환경 변수 (`.env.local`)

| 키 | 설명 |
|----|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 동상. 신규 프로젝트는 publishable key |
| `ANTHROPIC_API_KEY` | **서버 전용.** `NEXT_PUBLIC_` 금지 |
| `SYNTHESIS_MODEL` | 기본 `claude-sonnet-4-6`, 필요 시 `claude-opus-4-8` |

---

## 설정 체크리스트 (아직 해야 할 외부 작업)

### 1. Supabase
1. 프로젝트 생성 → `supabase/migrations/0001_init.sql` 을 SQL Editor에 붙여 실행
   (테이블 3개 + RLS + Realtime publication 한 번에).
2. Project Settings → API 에서 URL / anon key 를 `.env.local` 에 입력.

### 2. Google OAuth
1. **Google Cloud Console** → OAuth 2.0 클라이언트 ID 생성.
2. 승인된 리디렉션 URI에 `https://<project-ref>.supabase.co/auth/v1/callback` **정확히** 추가.
3. **Supabase** → Authentication → Providers → **Google** 활성화, Client ID/Secret 입력.
4. Supabase → Authentication → URL Configuration:
   - Site URL / Redirect URLs 에 `http://localhost:3000/**` 와 Vercel 도메인 추가.

### 3. Vercel 배포
1. GitHub 레포 연결 → import.
2. 위 환경 변수 4개 등록 → 배포.
3. 배포 URL을 Supabase Redirect URLs / Google 리디렉션 설정에 반영.

---

## 구조

```
app/
  page.tsx                 미로그인→로그인 / 로그인→나무 뷰
  auth/callback/route.ts   OAuth 코드→세션 교환
  api/synthesize/route.ts  서버 전용 합성 엔드포인트 (Claude)
components/
  tree-view.tsx            가지 목록 + Realtime 구독
  branch-card.tsx          가지 1개 + 잔가지
  new-branch-form.tsx
  synthesize-button.tsx    돌려보기 → 결과 다이얼로그
lib/
  supabase/{client,server,middleware}.ts
  synthesis-prompt.ts      PRD 8.1 시스템 프롬프트
proxy.ts                   세션 갱신 (Next 16: 구 middleware)
supabase/migrations/       DB 스키마
```

## 검증 (E2E)

1. Google 로그인 → 새로고침해도 세션 유지.
2. 두 브라우저에서 한쪽이 가지/잔가지 추가 → 다른 쪽 즉시 반영.
3. 가지 5~8개 시드 → 돌려보기 → 한 줄 X 표시 + `synthesis_runs` 1건.
4. 거의 동일한 직감만 → `synthesis_possible:false` + 거부 사유 표시.
5. 로그아웃 상태로 `POST /api/synthesize` → 401.
