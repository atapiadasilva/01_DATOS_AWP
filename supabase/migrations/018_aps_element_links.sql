-- ─── APS Viewer element → CWP assignments ───────────────────────────────────
-- Stores the mapping between 3D model elements (identified by APS externalId)
-- and the CWP they are assigned to.

CREATE TABLE IF NOT EXISTS public.aps_element_links (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  model_urn    TEXT        NOT NULL,           -- base64 URN of the APS model
  external_id  TEXT        NOT NULL,           -- APS externalId (permanent element ID)
  element_name TEXT,
  category     TEXT,
  cwp_code     TEXT        NOT NULL,           -- logical FK → cwp_master.cwp_code
  discipline   TEXT,
  linked_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  linked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, model_urn, external_id)
);

CREATE INDEX IF NOT EXISTS aps_links_project_idx ON public.aps_element_links (project_id);
CREATE INDEX IF NOT EXISTS aps_links_cwp_idx     ON public.aps_element_links (project_id, cwp_code);
CREATE INDEX IF NOT EXISTS aps_links_urn_idx     ON public.aps_element_links (model_urn);

ALTER TABLE public.aps_element_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read aps_element_links"
  ON public.aps_element_links FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "members can write aps_element_links"
  ON public.aps_element_links FOR ALL
  USING (auth.role() = 'authenticated');
