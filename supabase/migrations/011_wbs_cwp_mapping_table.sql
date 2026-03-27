-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — WBS-CWP MAPPING PERSISTENCE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.wbs_cwp_mappings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  edt          TEXT NOT NULL, -- El código WBS/EDT de la actividad
  cwp_name     TEXT NOT NULL, -- Nombre del CWP asignado
  assigned_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, edt)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS wbs_cwp_mappings_project_edt_idx ON public.wbs_cwp_mappings(project_id, edt);

-- RLS
ALTER TABLE public.wbs_cwp_mappings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view
CREATE POLICY "mappings_select" ON public.wbs_cwp_mappings
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to insert/update
CREATE POLICY "mappings_insert" ON public.wbs_cwp_mappings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "mappings_update" ON public.wbs_cwp_mappings
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "mappings_delete" ON public.wbs_cwp_mappings
  FOR DELETE USING (auth.role() = 'authenticated');

-- Nota: Esta tabla almacenará solo las asignaciones explícitas.
-- La propagación a hijos se manejará en el frontend o mediante vistas/funciones si es necesario.
