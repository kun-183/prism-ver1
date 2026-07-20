-- Synthesis MVP 초기 스키마 (RLS + Realtime)
-- 소규모 신뢰 팀 정책: 읽기는 전원 공유, 쓰기/수정/삭제는 본인 행만.

-- ── 테이블 ──────────────────────────────────────────────
create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) default auth.uid(),
  idea text not null,
  created_at timestamptz not null default now()
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  author_id uuid not null references auth.users(id) default auth.uid(),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists synthesis_runs (
  id uuid primary key default gen_random_uuid(),
  input_branch_ids uuid[] not null,
  result jsonb not null,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists comments_branch_id_idx on comments(branch_id);

-- ── RLS ────────────────────────────────────────────────
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

-- ── Realtime ───────────────────────────────────────────
-- branches / comments INSERT 이벤트를 구독하려면 publication 추가 필요.
alter publication supabase_realtime add table branches;
alter publication supabase_realtime add table comments;
