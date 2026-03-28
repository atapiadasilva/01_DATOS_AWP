-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — CWP VIEW PERSISTENT LINKS
-- Permite que las vinculaciones manuales entre vistas y CWPs sean persistentes.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cwp_view_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  cwp_code        TEXT NOT NULL,
  view_id         UUID REFERENCES public.custom_views(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, cwp_code, view_id)
);

-- RLS
ALTER TABLE public.cwp_view_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cwp_view_links_select" ON public.cwp_view_links
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "cwp_view_links_insert" ON public.cwp_view_links
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "cwp_view_links_delete" ON public.cwp_view_links
  FOR DELETE USING (auth.role() = 'authenticated');

-- Trigger para heredar project_id si no se provee (opcional, pero ayuda)
-- Para este caso lo manejaremos desde el frontend.

COMMENT ON TABLE public.cwp_view_links IS
  'Vinculaciones manuales persistentes entre vistas personalizadas y CWPs específicos.';
