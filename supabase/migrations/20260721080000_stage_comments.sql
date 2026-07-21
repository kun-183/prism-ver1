-- Human intuition captured at every problem-definition and solution stage.

create table if not exists stage_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  stage smallint not null check (stage between 1 and 6),
  author_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists stage_comments_project_stage_created_idx
  on stage_comments(project_id, stage, created_at);
create index if not exists stage_comments_author_id_idx
  on stage_comments(author_id);

alter table stage_comments enable row level security;

create policy stage_comments_member_select on stage_comments
  for select to authenticated using (
    exists (
      select 1 from project_members member
      where member.project_id = stage_comments.project_id
        and member.user_id = (select auth.uid())
    )
  );

create policy stage_comments_member_insert on stage_comments
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from project_members member
      where member.project_id = stage_comments.project_id
        and member.user_id = (select auth.uid())
    )
  );

create policy stage_comments_own_update on stage_comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from project_members member
      where member.project_id = stage_comments.project_id
        and member.user_id = (select auth.uid())
    )
  );

create policy stage_comments_own_delete on stage_comments
  for delete to authenticated using (author_id = (select auth.uid()));

alter table stage_comments replica identity full;
alter publication supabase_realtime add table stage_comments;
