-- 프로젝트 생성자 여부와 무관하게, 지정된 앱 관리자 계정만
-- 프로젝트 이름 변경과 전체 삭제를 수행할 수 있다.

create table if not exists app_admin_emails (
  email text primary key check (email = lower(btrim(email)))
);

alter table app_admin_emails enable row level security;

create or replace function is_project_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from app_admin_emails
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function is_project_admin() from public, anon;
grant execute on function is_project_admin() to authenticated;

drop policy if exists projects_admin_update on projects;
drop policy if exists projects_admin_delete on projects;

create policy projects_admin_update on projects
  for update to authenticated
  using (is_project_admin())
  with check (is_project_admin());

create policy projects_admin_delete on projects
  for delete to authenticated
  using (is_project_admin());

insert into app_admin_emails(email)
values ('ileekun0@gmail.com')
on conflict (email) do nothing;
