-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — BIM INTEGRATION
-- Modelos 3D IFC con enlaces a metodología AWP (CWP/EWP/PWP/disciplina)
-- Coloreado por avance, estado y clasificación.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Modelos BIM ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bim_models (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  file_url      TEXT NOT NULL,           -- Supabase Storage URL
  file_size     BIGINT DEFAULT 0,
  element_count INTEGER DEFAULT 0,
  uploaded_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Links: elementosIFC ↔ datos AWP ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bim_element_links (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id       UUID REFERENCES public.bim_models(id) ON DELETE CASCADE,
  project_id     UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  express_id     INTEGER NOT NULL,          -- ID numérico interno del IFC
  ifc_guid       TEXT,                      -- GlobalId del elemento IFC (22 chars)
  ifc_type       TEXT,                      -- IfcWall, IfcBeam, etc.
  element_name   TEXT,                      -- Name del elemento
  cwp_code       TEXT,                      -- FK lógica → cwp_master.cwp_code
  discipline     TEXT,                      -- Disciplina asignada
  ewp_code       TEXT,
  pwp_code       TEXT,
  status         TEXT DEFAULT 'not_started'
                   CHECK (status IN ('not_started','in_progress','complete','blocked','on_hold')),
  progress_pct   NUMERIC(5,2) DEFAULT 0
                   CHECK (progress_pct BETWEEN 0 AND 100),
  notes          TEXT,
  linked_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(model_id, express_id)
);

-- ── 3. Índices ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS bim_models_project_idx       ON public.bim_models(project_id);
CREATE INDEX IF NOT EXISTS bim_links_model_idx          ON public.bim_element_links(model_id);
CREATE INDEX IF NOT EXISTS bim_links_project_idx        ON public.bim_element_links(project_id);
CREATE INDEX IF NOT EXISTS bim_links_cwp_idx            ON public.bim_element_links(project_id, cwp_code);
CREATE INDEX IF NOT EXISTS bim_links_status_idx         ON public.bim_element_links(model_id, status);
CREATE INDEX IF NOT EXISTS bim_links_express_id_idx     ON public.bim_element_links(model_id, express_id);

-- ── 4. RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.bim_models          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bim_element_links   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bim_models_select" ON public.bim_models
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "bim_models_insert" ON public.bim_models
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "bim_models_update" ON public.bim_models
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "bim_models_delete" ON public.bim_models
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "bim_links_select" ON public.bim_element_links
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "bim_links_insert" ON public.bim_element_links
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "bim_links_update" ON public.bim_element_links
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "bim_links_delete" ON public.bim_element_links
  FOR DELETE USING (auth.role() = 'authenticated');

-- ── 5. Trigger updated_at ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_bim_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$
LANGUAGE plpgsql;

CREATE TRIGGER bim_models_updated_at
  BEFORE UPDATE ON public.bim_models
  FOR EACH ROW EXECUTE FUNCTION public.update_bim_updated_at();

CREATE TRIGGER bim_links_updated_at
  BEFORE UPDATE ON public.bim_element_links
  FOR EACH ROW EXECUTE FUNCTION public.update_bim_updated_at();

-- ── 6. Storage bucket (ejecutar solo si no existe) ─────────────────────────
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('bim-models', 'bim-models', false)
-- ON CONFLICT (id) DO NOTHING;

-- ── 7. RPC: resumen de avance por CWP en el modelo ────────────────────────
CREATE OR REPLACE FUNCTION public.bim_cwp_summary(p_model_id UUID)
RETURNS TABLE(
  cwp_code      TEXT,
  discipline    TEXT,
  total         BIGINT,
  complete      BIGINT,
  in_progress   BIGINT,
  not_started   BIGINT,
  blocked       BIGINT,
  avg_progress  NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    cwp_code,
    discipline,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'complete')     as complete,
    COUNT(*) FILTER (WHERE status = 'in_progress')  as in_progress,
    COUNT(*) FILTER (WHERE status = 'not_started')  as not_started,
    COUNT(*) FILTER (WHERE status = 'blocked')      as blocked,
    ROUND(AVG(progress_pct), 1)                     as avg_progress
  FROM public.bim_element_links
  WHERE model_id = p_model_id
    AND cwp_code IS NOT NULL
  GROUP BY cwp_code, discipline
  ORDER BY cwp_code;
$$;

GRANT EXECUTE ON FUNCTION public.bim_cwp_summary TO authenticated;

COMMENT ON TABLE public.bim_models IS 'Modelos IFC subidos por proyecto para visualización BIM-AWP.';
COMMENT ON TABLE public.bim_element_links IS 'Enlace entre elementos IFC (expressID/GUID) y datos AWP (CWP, disciplina, estado, avance).';
