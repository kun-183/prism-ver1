# Synthesis

> 제품의 현재 목적·출력 형식·사용 장면은 [`PRODUCT_DEFINITION.md`](./PRODUCT_DEFINITION.md)에 정리되어 있습니다.

대면 회의에서 팀의 날것 생각을 먼저 모으고, **표면 문제 → MECE 원인 가지 → 데이터 검증 → 인간의 직감 선택 → Synthesis 재구성 → 본질 문제정의**로 이어주는 현장 도구.
AI는 리서치·구조화·기록을 맡고, 사람은 본질 가지와 채택 근거를 직접 판단한다.

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
| `SYNTHESIS_DRAFT_MODEL` | MECE 분해 모델. 기본 `claude-haiku-4-5-20251001` |
| `SYNTHESIS_HIGH_MODEL` | 문제정의 전 Synthesis 재구성 모델. 기본 `claude-opus-4-8` |
| `SYNTHESIS_RESEARCH_MODEL` | 공공데이터 웹 검색 모델. 기본 `claude-sonnet-4-6` |
| `PROBLEM_DEFINITION_FINAL_MODEL` | 최종 문제정의 문서 생성 모델. 기본 `claude-opus-4-8` |

---

## 설정 체크리스트 (아직 해야 할 외부 작업)

### 1. Supabase
1. 프로젝트를 만들고 이 저장소를 `supabase link`로 연결한 뒤 `supabase db push`로 `supabase/migrations/` 전체를 순서대로 적용한다.
2. Project Settings → API 에서 URL / anon key 를 `.env.local` 에 입력.

### 2. Google OAuth
1. **Google Cloud Console** → OAuth 2.0 클라이언트 ID 생성.
2. 승인된 리디렉션 URI에 `https://<project-ref>.supabase.co/auth/v1/callback` **정확히** 추가.
3. **Supabase** → Authentication → Providers → **Google** 활성화, Client ID/Secret 입력.
4. Supabase → Authentication → URL Configuration:
   - Site URL / Redirect URLs 에 `http://localhost:3000/**` 와 Vercel 도메인 추가.

### 3. Vercel 배포
1. GitHub 레포 연결 → import.
2. 위 환경 변수 6개 등록 → 배포.
3. 배포 URL을 Supabase Redirect URLs / Google 리디렉션 설정에 반영.

---

## 구조

```
app/
  page.tsx                 미로그인 랜딩 / 로그인 세션 허브
  projects/[projectId]/    대면 문제정의 세션
  auth/callback/route.ts   OAuth 코드→세션 교환
  api/problem-session/     MECE·공공데이터·Synthesis·최종 문서 AI 엔드포인트
components/
  problem-session.tsx      5단계 현장 워크스페이스 + Realtime 구독
  branch-card.tsx          팀의 날것 생각 + 발전 맥락
  new-branch-form.tsx
lib/
  supabase/{client,server,middleware}.ts
  problem-session-engine.ts MECE·웹 검색·최종 정의 엔진
  synthesis-pipeline.ts     선택 자료의 N+1 문제 재구성 엔진
proxy.ts                   세션 갱신 (Next 16: 구 middleware)
supabase/migrations/       DB 스키마
```

## 검증 (E2E)

1. Google 로그인 → 새로고침해도 세션 유지.
2. 두 브라우저에서 한쪽이 생각·맥락 추가 → 다른 쪽 즉시 반영.
3. 표면 문제 저장 → MECE 가설 생성 → 사람이 본질 후보 선택.
4. 가지별 공공데이터 검색 또는 직접 입력 → 출처 URL 확인 → 근거 채택.
5. 본질 후보와 근거를 하나 이상 선택 → Synthesis 재구성 → Opus 최종 문서 생성·재열람.
6. 로그아웃 상태로 `POST /api/problem-session` → 401.
