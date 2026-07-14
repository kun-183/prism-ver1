-- 구조화된 합성 결과가 실제 후속 논의를 만들었는지 팀 반응으로 측정한다.
create table if not exists synthesis_reactions (
  id uuid primary key default gen_random_uuid(),
  synthesis_run_id uuid not null references synthesis_runs(id) on delete cascade,
  author_id uuid not null references auth.users(id) default auth.uid(),
  reaction text not null check (reaction in ('pulled', 'uneasy', 'missing')),
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (synthesis_run_id, author_id)
);

create index if not exists synthesis_reactions_run_id_idx
  on synthesis_reactions(synthesis_run_id);

alter table synthesis_reactions enable row level security;

create policy reactions_select on synthesis_reactions
  for select to authenticated using (true);
create policy reactions_insert on synthesis_reactions
  for insert to authenticated with check (author_id = auth.uid());
create policy reactions_update on synthesis_reactions
  for update to authenticated using (author_id = auth.uid())
  with check (author_id = auth.uid());
