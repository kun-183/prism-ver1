# Synthesis — MVP 실행계획 (Execution Plan)

> PRD v0.1 (2026-05-29, 이건) 기반. 본 문서는 PRD를 **순서 있는 실행 단계**로 변환한 빌드 계획이다.
> 원칙(PRD): *완벽한 설계보다 돌아가는 것.* 한 줄 X부터 출력하고, 팀 반응 보고 확장.

---

## Context — 왜 이걸 만드는가

대부분의 아이디어 회의는 **selection(여럿 중 하나 고르기)** 으로 끝나, 원래 누군가의 머릿속에 있던 것 이상이 안 나온다. Synthesis는 비대면·비동기로 직감(가지)과 맥락(잔가지)을 쌓아두고, "돌려보기"를 누르면 Claude가 입력 어느 것과도 같지 않은 **N+1번째 결론(한 문장 X)** 을 합성해준다. **AI가 합성을 대체하는 게 아니라**(충돌 식별·후보 제시까지), 판단은 인간이 한다는 게 핵심 차별점.

- **첫 사용자**: 제작자 본인 팀(PRISM 창업동아리 사이드 프로젝트), 3~10명.
- **MVP 검증 질문**: ① 이 도구가 정말 N+1을 만드는가 ② 팀원이 실제로 쓰는가.
- **이번 1차 커밋의 목표**: 가지/잔가지 실시간 수집 + "돌려보기 → 한 줄 X" 가 **배포된 URL에서 돌아가게** 만들고 팀 초대.

---

## 0. 확정 결정 (사용자 선택 반영)

| 항목 | 채택값 | 비고 |
|------|--------|------|
| 프로젝트 위치 | **`C:\Users\ileek\Desktop\synthesis`** | Desktop이 OneDrive 백업 대상이면 `node_modules` 동기화 성능 이슈 주의(§9) |
| 인증 방식 | **Google 로그인 (OAuth)** | Supabase Google provider + Google Cloud OAuth 클라이언트 필요 |
| 합성 모델 | **`claude-sonnet-4-6`** | 빠르고 저렴, 충분히 강력. `SYNTHESIS_MODEL` env로 `claude-opus-4-8` 전환 가능 |
| UI | **Tailwind + shadcn/ui** | Slack 느낌의 깔끔한 첫인상, 기성 컴포넌트로 속도↑ |

**환경 확인 완료**: Node v24.11.0, npm 11.8.0, git 2.51.2. greenfield(기존 코드 없음).

---

## PRD 대비 보정 사항 (반드시 반영)

1. **모델 ID 최신화** — PRD의 `claude-sonnet-4-20250514`/`claude-opus-4`는 구버전. 채택: **Sonnet 4.6 `claude-sonnet-4-6`**(기본). 더 높은 품질이 필요하면 **Opus 4.8 `claude-opus-4-8`** 로 env 전환.
2. **Anthropic 호출 방식 교체** — PRD 8.3의 raw `fetch` 예제는 `x-api-key`·`anthropic-version` 헤더 누락. 공식 SDK **`@anthropic-ai/sdk`** 사용 + **프롬프트 캐싱**(긴 시스템 프롬프트) + **JSON 프리필**(`assistant: "{"`)로 파싱 안정화.
3. **Supabase 인증은 `@supabase/ssr`** — 구식 `auth-helpers-nextjs` 아님. App Router용 `createServerClient`/`createBrowserClient` + 미들웨어 세션 갱신(공식 getAll/setAll 쿠키 패턴 + `getUser()` 호출).
4. **API 키는 서버 라우트에서만** — `ANTHROPIC_API_KEY`는 `NEXT_PUBLIC_` 접두어 금지. `/api/synthesize` Route Handler에서만 사용.

---

## 1. 기술 스택 (확정)

| 영역 | 기술 | 비고 |
|------|------|------|
| 프론트/서버 | Next.js (App Router) + TypeScript | Route Handler로 합성 호출 |
| 스타일 | Tailwind CSS + shadcn/ui | |
| DB/실시간/인증 | Supabase (Postgres + Realtime + Auth) | RLS 적용, Google OAuth |
| Supabase 클라 | `@supabase/ssr`, `@supabase/supabase-js` | |
| 합성 엔진 | Claude API via `@anthropic-ai/sdk` | `claude-sonnet-4-6` (env로 opus 전환) |
| 배포 | Vercel | GitHub 연동 자동 배포 |
| (Post-MVP) 임베딩 | OpenAI embeddings + pgvector | 제약2 유사도 검증 |

---

## 2. 목표 디렉토리 구조

```
synthesis/
├─ app/
│  ├─ page.tsx                 # 미로그인→"Google로 계속하기" / 로그인→나무 뷰
│  ├─ layout.tsx
│  ├─ auth/callback/route.ts   # OAuth 코드→세션 교환
│  └─ api/synthesize/route.ts  # 서버 전용 합성 엔드포인트
├─ components/
│  ├─ tree-view.tsx            # 가지 목록 + 실시간 구독 (client)
│  ├─ branch-card.tsx          # 가지 1개 + 잔가지 목록/입력
│  ├─ new-branch-form.tsx
│  ├─ synthesize-button.tsx    # "돌려보기" → /api/synthesize → 결과 다이얼로그
│  └─ ui/                      # shadcn 컴포넌트
├─ lib/
│  ├─ supabase/{client,server,middleware}.ts
│  └─ synthesis-prompt.ts      # PRD 8.1 시스템 프롬프트 상수
├─ middleware.ts               # 세션 갱신
├─ EXECUTION_PLAN.md           # 본 문서 사본(레포에 보관)
├─ .env.local                  # 시크릿 (git 제외)
└─ .env.example                # 키 목록 템플릿
```

---

## 3. 단계별 실행

### Phase A — 스캐폴딩 & 배포 파이프라인 *(먼저 "빈 앱이 Vercel에 뜬다"부터)*
- [ ] `npx create-next-app@latest synthesis --ts --tailwind --app --eslint --import-alias "@/*"` (위치: `C:\Users\ileek\Desktop\`)
- [ ] `git init` → 첫 커밋 → GitHub 레포 생성/푸시 (`gh repo create`)
- [ ] `npx shadcn@latest init` → `npx shadcn@latest add button input textarea card dialog skeleton`
- [ ] `npm i @supabase/ssr @supabase/supabase-js @anthropic-ai/sdk`
- [ ] 본 실행계획을 `EXECUTION_PLAN.md`로 레포에 저장
- [ ] Vercel에 레포 연결 → 기본 페이지 배포 확인 (env는 Phase B 이후 채움)
- **완료 기준**: 배포 URL에서 Next.js 기본 페이지가 뜬다.

### Phase B — Supabase 프로젝트 & 스키마
- [ ] Supabase 프로젝트 생성(또는 기존 사용). **Supabase MCP 도구**로 마이그레이션 적용 가능(`apply_migration`/`execute_sql`), 또는 SQL Editor에 §4 SQL 붙여넣기
- [ ] `branches` / `comments` / `synthesis_runs` 테이블 + **RLS 정책** 생성 (§4)
- [ ] `branches`·`comments`를 **Realtime publication에 추가** (§4)
- [ ] `.env.local` 채우기: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **완료 기준**: `list_tables`로 3개 테이블 + RLS 활성 확인.

### Phase C — 인증(Google OAuth)
- [ ] `lib/supabase/{client,server,middleware}.ts` + 루트 `middleware.ts` 작성(§5)
- [ ] **Google Cloud Console**: OAuth 2.0 클라이언트 ID 생성 → 승인된 리디렉션 URI에 `https://<project-ref>.supabase.co/auth/v1/callback` 추가 → Client ID/Secret 확보
- [ ] **Supabase**: Authentication → Providers → **Google 활성화**, 위 Client ID/Secret 입력
- [ ] `app/auth/callback/route.ts` — `exchangeCodeForSession(code)` 후 `/`로 리다이렉트
- [ ] `app/page.tsx`: 세션 없으면 "Google로 계속하기" 버튼 → `supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: \`${origin}/auth/callback\` } })`
- [ ] Supabase Auth 설정: Site URL / Redirect URLs에 `http://localhost:3000/**` 와 Vercel 도메인 추가
- **완료 기준**: Google 계정으로 로그인 → 새로고침해도 세션 유지.

### Phase D — 나무 뷰(가지/잔가지 + 실시간)
- [ ] 서버 컴포넌트에서 초기 `branches`(+각 가지의 `comments`) 로드
- [ ] `new-branch-form` (직감 한 줄 insert) / `branch-card`의 잔가지 입력(comment insert)
- [ ] `tree-view` client 컴포넌트: `supabase.channel(...).on('postgres_changes',{event:'INSERT',schema:'public',table:'branches'|'comments'},…).subscribe()` 구독 → 상태 갱신(또는 `router.refresh()`). 언마운트 시 `removeChannel`
- **완료 기준**: 두 브라우저(또는 두 계정)에서 한쪽이 가지/잔가지 추가 시 다른 쪽에 즉시 반영.

### Phase E — 돌려보기(합성)
- [ ] `lib/synthesis-prompt.ts` — PRD 8.1 시스템 프롬프트를 상수로
- [ ] `app/api/synthesize/route.ts`(§5): 서버 세션으로 전체 가지+잔가지 조회 → SDK 호출(캐싱+프리필) → JSON 파싱(+1회 재시도) → `synthesis_runs` insert → 결과 반환
- [ ] `synthesize-button` + 결과 다이얼로그: `X` 한 줄 표시. `synthesis_possible:false`면 `refusal_reason` 표시, `diversity_warning` 있으면 배지
- **완료 기준**: 가지 5~8개 시드 후 "돌려보기" → 한 줄 X 출력 + `synthesis_runs`에 로그 1건.

### Phase F — 배포 & 팀 초대 & 지표
- [ ] Vercel 환경변수 등록(§6) → 재배포 → 프로덕션 스모크 테스트(§7)
- [ ] 팀원에게 배포 URL 공유, Google 로그인으로 실사용 시작
- [ ] **N+1 인식률** 반응 수집(결과 본 뒤 "우리가 함께 만든 거네" vs "이건 ○○ 거네"), 합성 거부율 관찰
- **완료 기준**: 팀원 전원 1회 이상 가지 작성 + "돌려보기" 주 1회 이상.

---

## 4. 데이터 모델 SQL (RLS + Realtime 포함)

> 소규모 신뢰 팀 정책: **읽기는 전원 공유, 쓰기/수정/삭제는 본인 행만**.

```sql
-- 테이블
create table branches (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) default auth.uid(),
  idea text not null,
  created_at timestamptz not null default now()
);
create table comments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  author_id uuid not null references auth.users(id) default auth.uid(),
  body text not null,
  created_at timestamptz not null default now()
);
create table synthesis_runs (
  id uuid primary key default gen_random_uuid(),
  input_branch_ids uuid[] not null,
  result jsonb not null,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on comments(branch_id);

-- RLS
alter table branches enable row level security;
alter table comments enable row level security;
alter table synthesis_runs enable row level security;

create policy branches_select on branches for select to authenticated using (true);
create policy branches_insert on branches for insert to authenticated with check (author_id = auth.uid());
create policy branches_modify on branches for update to authenticated using (author_id = auth.uid());
create policy branches_delete on branches for delete to authenticated using (author_id = auth.uid());

create policy comments_select on comments for select to authenticated using (true);
create policy comments_insert on comments for insert to authenticated with check (author_id = auth.uid());
create policy comments_modify on comments for update to authenticated using (author_id = auth.uid());
create policy comments_delete on comments for delete to authenticated using (author_id = auth.uid());

create policy runs_select on synthesis_runs for select to authenticated using (true);
create policy runs_insert on synthesis_runs for insert to authenticated with check (created_by = auth.uid());

-- Realtime (또는 대시보드 Database→Replication 에서 토글)
alter publication supabase_realtime add table branches;
alter publication supabase_realtime add table comments;
```

> 주의: Realtime의 `postgres_changes`는 구독자의 SELECT 권한을 따르므로 위 select 정책(전원 true)으로 충분. DELETE 이벤트의 이전 행이 필요하면 `replica identity full` 추가(MVP엔 불필요).

---

## 5. 핵심 코드 설계 (구조 — 실행 시 작성)

**`lib/supabase/client.ts`** — `createBrowserClient(url, anon)` 반환하는 `createClient()`.
**`lib/supabase/server.ts`** — `createServerClient(url, anon, { cookies: { getAll(), setAll() } })`, `next/headers`의 `await cookies()` 사용.
**`middleware.ts`** — 매 요청 세션 토큰 갱신(`updateSession`). 공식 주의: `createServerClient`와 `getUser()` 사이에 코드 넣지 말 것, `getUser()` 제거 금지, `supabaseResponse` 그대로 반환.
**로그인** — `app/page.tsx`에서 `supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo } })`.
**`app/auth/callback/route.ts`** — 쿼리의 `code`로 `exchangeCodeForSession(code)` 후 홈 리다이렉트.

**`app/api/synthesize/route.ts`** (서버 전용):
```ts
import Anthropic from "@anthropic-ai/sdk";
import { SYNTHESIS_SYSTEM_PROMPT } from "@/lib/synthesis-prompt";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // 전체 가지 + 잔가지 조회 (RLS 적용된 사용자 세션으로)
  const { data: branchesRaw } = await supabase
    .from("branches")
    .select("id, idea, comments(body)")
    .order("created_at");
  const branches = (branchesRaw ?? []).map(b => ({
    id: b.id, idea: b.idea, comments: (b.comments ?? []).map((c:any)=>c.body),
  }));

  const anthropic = new Anthropic(); // ANTHROPIC_API_KEY
  const msg = await anthropic.messages.create({
    model: process.env.SYNTHESIS_MODEL ?? "claude-sonnet-4-6",
    max_tokens: 1500,
    system: [{ type: "text", text: SYNTHESIS_SYSTEM_PROMPT,
               cache_control: { type: "ephemeral" } }],   // 긴 프롬프트 캐싱
    messages: [
      { role: "user", content: JSON.stringify({ branches }) },
      { role: "assistant", content: "{" },                // JSON 프리필
    ],
  });
  const raw = "{" + msg.content.filter(b=>b.type==="text").map((b:any)=>b.text).join("");
  let result;
  try { result = JSON.parse(raw); }
  catch { /* 1회 재시도(프리필 없이) 후 실패 시 502 */ }

  await supabase.from("synthesis_runs").insert({
    input_branch_ids: branches.map(b=>b.id), result,
  });
  return Response.json(result);
}
```
- **프롬프트 캐싱**: 시스템 프롬프트(>1024토큰)에 `cache_control` → 개발 중 연속 테스트(5분 TTL) 비용/지연 절감.
- **JSON 안정화**: `assistant:"{"` 프리필로 모델이 곧장 JSON 출력 → 마크다운 펜스 제거 불필요. 파싱 실패 시 1회 재시도.
- **서비스 롤 불필요**: RLS가 읽기를 허용하므로 사용자 세션으로 충분. (PRD의 `SUPABASE_SERVICE_ROLE_KEY`는 선택사항.)

---

## 6. 환경 변수

`.env.local`(로컬) 과 Vercel(프로덕션) 양쪽에 등록:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=        # 신규 프로젝트는 PUBLISHABLE_KEY로 표기될 수 있음(동일 역할)
ANTHROPIC_API_KEY=                    # 서버 전용, NEXT_PUBLIC 금지
SYNTHESIS_MODEL=claude-sonnet-4-6     # 'claude-opus-4-8'으로 교체 가능
# OPENAI_API_KEY=                     # Post-MVP(임베딩)
```

---

## 7. 검증 (End-to-End)

1. **로그인**: `npm run dev` → `localhost:3000` → "Google로 계속하기" → 동의 → 로그인·세션 유지 확인.
2. **실시간**: 브라우저 A에서 가지 생성 → 브라우저 B에 즉시 표시. 잔가지도 동일 확인.
3. **합성(정상)**: PRD 8.2 예시 등 가지 5~8개 시드 → "돌려보기" → 한 줄 X 표시. Supabase에서 `synthesis_runs` 1건 + `result` jsonb 확인.
4. **합성(거부)**: 거의 동일한 직감만 입력 → `synthesis_possible:false` + `refusal_reason` 표시되는지(정직한 거부) 확인.
5. **권한**: 로그아웃 상태로 `/api/synthesize` 직접 호출 시 401.
6. **프로덕션**: Vercel env 등록 후 배포 URL에서 1~4 재현. Google OAuth 리디렉션 URI·Supabase Redirect URLs에 Vercel 도메인 포함 확인.

---

## 8. Post-MVP 백로그 (PRD에서 이월)

- 기여 추적 펼치기 UI(차원/직교쌍/contribution 표시) — N+1 인식률 낮으면 우선순위↑
- 가지 선택 합성(전체 대신 일부 선택)
- 익명 입력 토글(작성자 비공개)
- 제약2 유사도 분산성: OpenAI embeddings + pgvector 후처리 검증
- 자기 thesis 편향 검출(다른 입력→다른 X 검증)
- 합성 품질이 부족하면 모델을 `claude-opus-4-8`로 전환(env 한 줄)
- 제품 정식 명칭 확정(나무 메타포 한글명)

---

## 9. 리스크 & 주의점

- **키 노출**: 합성은 서버 라우트에서만. `ANTHROPIC_API_KEY`에 `NEXT_PUBLIC_` 금지.
- **Google OAuth 리디렉션**: Google Cloud의 승인된 리디렉션 URI는 `https://<project-ref>.supabase.co/auth/v1/callback` 와 **정확히** 일치해야 함. 앱 콜백(`/auth/callback`)은 Supabase Redirect URLs에 등록.
- **Realtime+RLS**: publication 추가 + select 정책(전원 true) 둘 다 필요. 누락 시 이벤트 안 옴.
- **JSON 파싱**: 프리필+재시도로 방어. 그래도 실패 시 사용자에겐 "다시 시도" 안내.
- **OneDrive**: Desktop이 OneDrive 백업 대상이면 `node_modules`가 동기화돼 성능 저하/파일 잠금 발생 가능 → OneDrive 설정에서 프로젝트 폴더 제외 권장.
- **모델 전환**: 품질/비용 트레이드오프는 `SYNTHESIS_MODEL` env 한 줄로 조정(기본 sonnet-4-6, 필요 시 opus-4-8).
