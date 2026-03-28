CREATE TABLE IF NOT EXISTS public.aps_wbs_links (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  model_urn    TEXT        NOT NULL,
  external_id  TEXT        NOT NULL,
  wbs_id       TEXT        NOT NULL,
  task_name    TEXT,
  linked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, model_urn, external_id)
);

CREATE INDEX IF NOT EXISTS aps_wbs_project_idx ON public.aps_wbs_links (project_id);
CREATE INDEX IF NOT EXISTS aps_wbs_wbs_idx     ON public.aps_wbs_links (project_id, wbs_id);

ALTER TABLE public.aps_wbs_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read aps_wbs_links"
  ON public.aps_wbs_links FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "members can write aps_wbs_links"
  ON public.aps_wbs_links FOR ALL USING (auth.role() = 'authenticated');
