-- PRISM 솔루션 도출: 본질 정의 이후 5계열 발산 -> 선례 -> 선택적 N+1 합성

create table if not exists solution_candidates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  author_id uuid references auth.users(id) default auth.uid(),
  source text not null check (source in ('ai', 'human')),
  category text not null check (category in ('digital', 'environment', 'policy', 'service', 'community')),
  label text not null check (char_length(label) between 1 and 160),
  statement text not null check (char_length(statement) between 1 and 2000),
  essence_link text not null check (char_length(essence_link) between 1 and 2000),
  tradeoff text not null check (char_length(tradeoff) between 1 and 1200),
  created_at timestamptz not null default now()
);

create index if not exists solution_candidates_project_category_idx
  on solution_candidates(project_id, category, created_at);

create table if not exists solution_references (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  candidate_id uuid not null references solution_candidates(id) on delete cascade,
  author_id uuid references auth.users(id) default auth.uid(),
  source text not null check (source in ('web', 'human')),
  title text not null check (char_length(title) between 1 and 500),
  publisher text not null default '' check (char_length(publisher) <= 240),
  url text not null default '' check (char_length(url) <= 2000),
  finding text not null check (char_length(finding) between 1 and 3000),
  data_date text not null default '' check (char_length(data_date) <= 120),
  created_at timestamptz not null default now()
);

create index if not exists solution_references_project_candidate_idx
  on solution_references(project_id, candidate_id, created_at);

create table if not exists solution_syntheses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  author_id uuid references auth.users(id) default auth.uid(),
  input_candidate_ids uuid[] not null check (cardinality(input_candidate_ids) between 2 and 5),
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists solution_syntheses_project_created_idx
  on solution_syntheses(project_id, created_at desc);

alter table solution_candidates enable row level security;
alter table solution_references enable row level security;
alter table solution_syntheses enable row level security;

create policy solution_candidates_member_select on solution_candidates
  for select to authenticated using (
    exists (select 1 from project_members m
      where m.project_id = solution_candidates.project_id and m.user_id = auth.uid())
  );
create policy solution_candidates_member_insert on solution_candidates
  for insert to authenticated with check (
    author_id = auth.uid() and exists (select 1 from project_members m
      where m.project_id = solution_candidates.project_id and m.user_id = auth.uid())
  );
create policy solution_candidates_own_delete on solution_candidates
  for delete to authenticated using (
    author_id = auth.uid() and exists (select 1 from project_members m
      where m.project_id = solution_candidates.project_id and m.user_id = auth.uid())
  );

create policy solution_references_member_select on solution_references
  for select to authenticated using (
    exists (select 1 from project_members m
      where m.project_id = solution_references.project_id and m.user_id = auth.uid())
  );
create policy solution_references_member_insert on solution_references
  for insert to authenticated with check (
    author_id = auth.uid() and exists (select 1 from project_members m
      where m.project_id = solution_references.project_id and m.user_id = auth.uid())
  );
create policy solution_references_own_delete on solution_references
  for delete to authenticated using (author_id = auth.uid());

create policy solution_syntheses_member_select on solution_syntheses
  for select to authenticated using (
    exists (select 1 from project_members m
      where m.project_id = solution_syntheses.project_id and m.user_id = auth.uid())
  );
create policy solution_syntheses_member_insert on solution_syntheses
  for insert to authenticated with check (
    author_id = auth.uid() and exists (select 1 from project_members m
      where m.project_id = solution_syntheses.project_id and m.user_id = auth.uid())
  );

alter table solution_candidates replica identity full;
alter table solution_references replica identity full;
alter table solution_syntheses replica identity full;

alter publication supabase_realtime add table solution_candidates;
alter publication supabase_realtime add table solution_references;
alter publication supabase_realtime add table solution_syntheses;
