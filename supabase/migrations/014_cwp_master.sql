-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — CWP MASTER REGISTRY (Fuente de Verdad)
-- Catálogo canónico de CWPs con disciplina, EWP y PWP fijos por proyecto.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cwp_master (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  cwp_code        TEXT NOT NULL,
  cwp_description TEXT NOT NULL DEFAULT '',
  discipline      TEXT NOT NULL DEFAULT '',
  ewp_code        TEXT NOT NULL DEFAULT '',
  pwp_code        TEXT NOT NULL DEFAULT '',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, cwp_code)
);

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS cwp_master_project_idx
  ON public.cwp_master(project_id);
CREATE INDEX IF NOT EXISTS cwp_master_discipline_idx
  ON public.cwp_master(project_id, discipline);
CREATE INDEX IF NOT EXISTS cwp_master_ewp_idx
  ON public.cwp_master(project_id, ewp_code);
CREATE INDEX IF NOT EXISTS cwp_master_pwp_idx
  ON public.cwp_master(project_id, pwp_code);

-- RLS
ALTER TABLE public.cwp_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cwp_master_select" ON public.cwp_master
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "cwp_master_insert" ON public.cwp_master
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "cwp_master_update" ON public.cwp_master
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "cwp_master_delete" ON public.cwp_master
  FOR DELETE USING (auth.role() = 'authenticated');

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION public.update_cwp_master_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cwp_master_updated_at
  BEFORE UPDATE ON public.cwp_master
  FOR EACH ROW EXECUTE FUNCTION public.update_cwp_master_updated_at();

COMMENT ON TABLE public.cwp_master IS
  'Catálogo canónico de CWPs. Fuente de verdad de códigos, descripciones, disciplinas, EWPs y PWPs por proyecto.';
