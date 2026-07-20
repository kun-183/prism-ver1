-- 팀별 프로젝트 경계 + 비밀번호 입장
-- 프로젝트 비밀번호는 project_secrets에 bcrypt 해시로만 저장하며,
-- SECURITY DEFINER 함수 외에는 읽을 수 없다.

create extension if not exists pgcrypto with schema extensions;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create unique index if not exists projects_name_unique_idx
  on projects (lower(btrim(name)));

create table if not exists project_secrets (
  project_id uuid primary key references projects(id) on delete cascade,
  password_hash text not null
);

create table if not exists project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_id_idx
  on project_members(user_id);

-- 기존 가지와 합성 결과를 담을 기본 프로젝트.
-- 기존 사용자는 비밀번호 1234를 입력한 뒤 멤버십을 얻는다.
insert into projects (id, name, created_by)
values ('00000000-0000-4000-8000-000000000001', 'rise 사업단', null)
on conflict (id) do update set name = excluded.name;

insert into project_secrets (project_id, password_hash)
values (
  '00000000-0000-4000-8000-000000000001',
  extensions.crypt('1234', extensions.gen_salt('bf', 10))
)
on conflict (project_id) do nothing;

alter table branches
  add column if not exists project_id uuid references projects(id) on delete cascade;

update branches
set project_id = '00000000-0000-4000-8000-000000000001'
where project_id is null;

alter table branches alter column project_id set not null;

create index if not exists branches_project_id_created_at_idx
  on branches(project_id, created_at);

alter table synthesis_runs
  add column if not exists project_id uuid references projects(id) on delete cascade;

update synthesis_runs as run
set project_id = coalesce(
  (
    select branch.project_id
    from branches as branch
    where branch.id = any(run.input_branch_ids)
    limit 1
  ),
  '00000000-0000-4000-8000-000000000001'
)
where run.project_id is null;

alter table synthesis_runs alter column project_id set not null;

create index if not exists synthesis_runs_project_id_created_at_idx
  on synthesis_runs(project_id, created_at);

alter table projects enable row level security;
alter table project_secrets enable row level security;
alter table project_members enable row level security;

create policy projects_select on projects
  for select to authenticated using (true);

create policy project_members_select_own on project_members
  for select to authenticated using (user_id = auth.uid());

-- 프로젝트 생성과 비밀번호 검증은 비밀 테이블을 노출하지 않는 함수로만 수행한다.
create or replace function create_project(p_name text, p_password text)
returns table (
  project_id uuid,
  project_name text,
  project_created_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  new_project projects%rowtype;
  clean_name text := btrim(p_name);
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if char_length(clean_name) < 1 or char_length(clean_name) > 80 then
    raise exception '프로젝트 이름은 1~80자로 입력해 주세요.';
  end if;
  if char_length(p_password) < 4 or char_length(p_password) > 72 then
    raise exception '비밀번호는 4~72자로 입력해 주세요.';
  end if;

  insert into projects (name, created_by)
  values (clean_name, auth.uid())
  returning * into new_project;

  insert into project_secrets (project_id, password_hash)
  values (
    new_project.id,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10))
  );

  insert into project_members (project_id, user_id)
  values (new_project.id, auth.uid())
  on conflict do nothing;

  return query
  select new_project.id, new_project.name, new_project.created_at;
end;
$$;

create or replace function unlock_project(p_project_id uuid, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  password_matches boolean;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select exists (
    select 1
    from project_secrets as secret
    where secret.project_id = p_project_id
      and secret.password_hash = extensions.crypt(p_password, secret.password_hash)
  ) into password_matches;

  if password_matches then
    insert into project_members (project_id, user_id)
    values (p_project_id, auth.uid())
    on conflict do nothing;
  end if;

  return password_matches;
end;
$$;

revoke all on function create_project(text, text) from public, anon;
revoke all on function unlock_project(uuid, text) from public, anon;
grant execute on function create_project(text, text) to authenticated;
grant execute on function unlock_project(uuid, text) to authenticated;

-- 기존의 전역 공유 정책을 프로젝트 멤버십 기준으로 교체한다.
drop policy if exists branches_select on branches;
drop policy if exists branches_insert on branches;
drop policy if exists branches_modify on branches;
drop policy if exists branches_delete on branches;

create policy branches_select on branches
  for select to authenticated
  using (
    exists (
      select 1 from project_members
      where project_members.project_id = branches.project_id
        and project_members.user_id = auth.uid()
    )
  );

create policy branches_insert on branches
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from project_members
      where project_members.project_id = branches.project_id
        and project_members.user_id = auth.uid()
    )
  );

create policy branches_modify on branches
  for update to authenticated
  using (
    author_id = auth.uid()
    and exists (
      select 1 from project_members
      where project_members.project_id = branches.project_id
        and project_members.user_id = auth.uid()
    )
  )
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from project_members
      where project_members.project_id = branches.project_id
        and project_members.user_id = auth.uid()
    )
  );

create policy branches_delete on branches
  for delete to authenticated
  using (
    author_id = auth.uid()
    and exists (
      select 1 from project_members
      where project_members.project_id = branches.project_id
        and project_members.user_id = auth.uid()
    )
  );

drop policy if exists comments_select on comments;
drop policy if exists comments_insert on comments;
drop policy if exists comments_modify on comments;
drop policy if exists comments_delete on comments;

create policy comments_select on comments
  for select to authenticated
  using (
    exists (
      select 1
      from branches
      join project_members on project_members.project_id = branches.project_id
      where branches.id = comments.branch_id
        and project_members.user_id = auth.uid()
    )
  );

create policy comments_insert on comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1
      from branches
      join project_members on project_members.project_id = branches.project_id
      where branches.id = comments.branch_id
        and project_members.user_id = auth.uid()
    )
  );

create policy comments_modify on comments
  for update to authenticated
  using (
    author_id = auth.uid()
    and exists (
      select 1
      from branches
      join project_members on project_members.project_id = branches.project_id
      where branches.id = comments.branch_id
        and project_members.user_id = auth.uid()
    )
  )
  with check (
    author_id = auth.uid()
    and exists (
      select 1
      from branches
      join project_members on project_members.project_id = branches.project_id
      where branches.id = comments.branch_id
        and project_members.user_id = auth.uid()
    )
  );

create policy comments_delete on comments
  for delete to authenticated
  using (
    author_id = auth.uid()
    and exists (
      select 1
      from branches
      join project_members on project_members.project_id = branches.project_id
      where branches.id = comments.branch_id
        and project_members.user_id = auth.uid()
    )
  );

drop policy if exists runs_select on synthesis_runs;
drop policy if exists runs_insert on synthesis_runs;

create policy runs_select on synthesis_runs
  for select to authenticated
  using (
    exists (
      select 1 from project_members
      where project_members.project_id = synthesis_runs.project_id
        and project_members.user_id = auth.uid()
    )
  );

create policy runs_insert on synthesis_runs
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from project_members
      where project_members.project_id = synthesis_runs.project_id
        and project_members.user_id = auth.uid()
    )
  );

drop policy if exists reactions_select on synthesis_reactions;
drop policy if exists reactions_insert on synthesis_reactions;
drop policy if exists reactions_update on synthesis_reactions;

create policy reactions_select on synthesis_reactions
  for select to authenticated
  using (
    exists (
      select 1
      from synthesis_runs
      join project_members on project_members.project_id = synthesis_runs.project_id
      where synthesis_runs.id = synthesis_reactions.synthesis_run_id
        and project_members.user_id = auth.uid()
    )
  );

create policy reactions_insert on synthesis_reactions
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1
      from synthesis_runs
      join project_members on project_members.project_id = synthesis_runs.project_id
      where synthesis_runs.id = synthesis_reactions.synthesis_run_id
        and project_members.user_id = auth.uid()
    )
  );

create policy reactions_update on synthesis_reactions
  for update to authenticated
  using (
    author_id = auth.uid()
    and exists (
      select 1
      from synthesis_runs
      join project_members on project_members.project_id = synthesis_runs.project_id
      where synthesis_runs.id = synthesis_reactions.synthesis_run_id
        and project_members.user_id = auth.uid()
    )
  )
  with check (
    author_id = auth.uid()
    and exists (
      select 1
      from synthesis_runs
      join project_members on project_members.project_id = synthesis_runs.project_id
      where synthesis_runs.id = synthesis_reactions.synthesis_run_id
        and project_members.user_id = auth.uid()
    )
  );
