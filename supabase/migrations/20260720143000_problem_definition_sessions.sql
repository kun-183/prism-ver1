-- PRISM 문제정의 세션: 표면 문제 -> MECE 드릴 -> 근거 -> 인간 선택 -> 최종 정의

create table if not exists problem_sessions (
  project_id uuid primary key references projects(id) on delete cascade,
  topic text not null default '' check (char_length(topic) <= 200),
  subject text not null default '' check (char_length(subject) <= 300),
  situation text not null default '' check (char_length(situation) <= 600),
  surface_problem text not null default '' check (char_length(surface_problem) <= 2000),
  impact text not null default '' check (char_length(impact) <= 1000),
  stage smallint not null default 1 check (stage between 1 and 5),
  final_definition jsonb,
  completed_at timestamptz,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists problem_nodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  parent_id uuid references problem_nodes(id) on delete cascade,
  author_id uuid references auth.users(id) default auth.uid(),
  source text not null check (source in ('ai', 'human')),
  depth smallint not null default 1 check (depth between 1 and 5),
  axis text not null default '' check (char_length(axis) <= 120),
  label text not null check (char_length(label) between 1 and 160),
  statement text not null check (char_length(statement) between 1 and 2000),
  why_question text not null default '' check (char_length(why_question) <= 500),
  rationale text not null default '' check (char_length(rationale) <= 1200),
  created_at timestamptz not null default now()
);

create index if not exists problem_nodes_project_depth_idx
  on problem_nodes(project_id, depth, created_at);
create index if not exists problem_nodes_parent_idx on problem_nodes(parent_id);

create table if not exists problem_node_votes (
  node_id uuid not null references problem_nodes(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (node_id, author_id)
);

create table if not exists problem_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  node_id uuid not null references problem_nodes(id) on delete cascade,
  author_id uuid references auth.users(id) default auth.uid(),
  source text not null check (source in ('web', 'human')),
  role text not null check (role in ('diverge', 'support', 'challenge')),
  title text not null check (char_length(title) between 1 and 500),
  publisher text not null default '' check (char_length(publisher) <= 240),
  url text not null default '' check (char_length(url) <= 2000),
  finding text not null check (char_length(finding) between 1 and 3000),
  data_date text not null default '' check (char_length(data_date) <= 120),
  created_at timestamptz not null default now()
);

create index if not exists problem_evidence_project_node_idx
  on problem_evidence(project_id, node_id, created_at);

create table if not exists problem_evidence_votes (
  evidence_id uuid not null references problem_evidence(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (evidence_id, author_id)
);

alter table problem_sessions enable row level security;
alter table problem_nodes enable row level security;
alter table problem_node_votes enable row level security;
alter table problem_evidence enable row level security;
alter table problem_evidence_votes enable row level security;

create policy problem_sessions_member_all on problem_sessions
  for all to authenticated
  using (
    exists (select 1 from project_members m
      where m.project_id = problem_sessions.project_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from project_members m
      where m.project_id = problem_sessions.project_id and m.user_id = auth.uid())
  );

create policy problem_nodes_member_select on problem_nodes
  for select to authenticated using (
    exists (select 1 from project_members m
      where m.project_id = problem_nodes.project_id and m.user_id = auth.uid())
  );
create policy problem_nodes_member_insert on problem_nodes
  for insert to authenticated with check (
    author_id = auth.uid() and exists (select 1 from project_members m
      where m.project_id = problem_nodes.project_id and m.user_id = auth.uid())
  );
create policy problem_nodes_own_delete on problem_nodes
  for delete to authenticated using (
    author_id = auth.uid() and exists (select 1 from project_members m
      where m.project_id = problem_nodes.project_id and m.user_id = auth.uid())
  );

create policy problem_node_votes_member_select on problem_node_votes
  for select to authenticated using (
    exists (select 1 from problem_nodes n join project_members m on m.project_id = n.project_id
      where n.id = problem_node_votes.node_id and m.user_id = auth.uid())
  );
create policy problem_node_votes_own_insert on problem_node_votes
  for insert to authenticated with check (
    author_id = auth.uid() and exists (
      select 1 from problem_nodes n join project_members m on m.project_id = n.project_id
      where n.id = problem_node_votes.node_id and m.user_id = auth.uid()
    )
  );
create policy problem_node_votes_own_delete on problem_node_votes
  for delete to authenticated using (author_id = auth.uid());

create policy problem_evidence_member_select on problem_evidence
  for select to authenticated using (
    exists (select 1 from project_members m
      where m.project_id = problem_evidence.project_id and m.user_id = auth.uid())
  );
create policy problem_evidence_member_insert on problem_evidence
  for insert to authenticated with check (
    author_id = auth.uid() and exists (select 1 from project_members m
      where m.project_id = problem_evidence.project_id and m.user_id = auth.uid())
  );
create policy problem_evidence_own_delete on problem_evidence
  for delete to authenticated using (author_id = auth.uid());

create policy problem_evidence_votes_member_select on problem_evidence_votes
  for select to authenticated using (
    exists (select 1 from problem_evidence e join project_members m on m.project_id = e.project_id
      where e.id = problem_evidence_votes.evidence_id and m.user_id = auth.uid())
  );
create policy problem_evidence_votes_own_insert on problem_evidence_votes
  for insert to authenticated with check (
    author_id = auth.uid() and exists (
      select 1 from problem_evidence e join project_members m on m.project_id = e.project_id
      where e.id = problem_evidence_votes.evidence_id and m.user_id = auth.uid()
    )
  );
create policy problem_evidence_votes_own_delete on problem_evidence_votes
  for delete to authenticated using (author_id = auth.uid());

alter table problem_sessions replica identity full;
alter table problem_nodes replica identity full;
alter table problem_node_votes replica identity full;
alter table problem_evidence replica identity full;
alter table problem_evidence_votes replica identity full;

alter publication supabase_realtime add table problem_sessions;
alter publication supabase_realtime add table problem_nodes;
alter publication supabase_realtime add table problem_node_votes;
alter publication supabase_realtime add table problem_evidence;
alter publication supabase_realtime add table problem_evidence_votes;
