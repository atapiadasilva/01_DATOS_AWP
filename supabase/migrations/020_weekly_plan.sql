-- 020_weekly_plan.sql
-- Planificación Trisemanal: actividades de 3 semanas + vinculación a elementos BIM

create table if not exists weekly_plan_activities (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) on delete cascade,
  title       text    not null,
  discipline  text    not null default '',
  start_date  date    not null,
  end_date    date    not null,
  progress    int     not null default 0 check (progress between 0 and 100),
  wbs_edt     text    not null default '',
  wbs_name    text    not null default '',
  notes       text    not null default '',
  color       text    not null default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists weekly_plan_links (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid references weekly_plan_activities(id) on delete cascade not null,
  project_id  uuid   not null,
  model_urn   text   not null,
  external_id text   not null,
  unique(activity_id, model_urn, external_id)
);

alter table weekly_plan_activities enable row level security;
alter table weekly_plan_links      enable row level security;

create policy "wpa_all" on weekly_plan_activities for all using (true) with check (true);
create policy "wpl_all" on weekly_plan_links      for all using (true) with check (true);
