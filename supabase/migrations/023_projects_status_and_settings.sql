-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — Fix projects table + ensure project_settings exists
-- Run this BEFORE or AFTER 022 — it is idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Add status column to projects if missing ───────────────────────────
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived'));

-- ── 2. Ensure project_settings table exists (idempotent with 022) ─────────
CREATE TABLE IF NOT EXISTS public.project_settings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL UNIQUE
                          REFERENCES public.projects(id) ON DELETE CASCADE,
  aps_model_urn            TEXT,
  aps_model_name           TEXT,
  wbs_entity_name          TEXT NOT NULL DEFAULT 'PROGRAMA DE OBRA ACTUALIZADO',
  wbs_col_edt              TEXT NOT NULL DEFAULT 'EDT',
  wbs_col_name             TEXT NOT NULL DEFAULT 'Nombre de tarea',
  wbs_col_start            TEXT NOT NULL DEFAULT 'Comienzo Actual',
  wbs_col_end              TEXT NOT NULL DEFAULT 'Fin Actual',
  wbs_col_baseline_start   TEXT NOT NULL DEFAULT 'Comienzo de línea base1',
  wbs_col_baseline_end     TEXT NOT NULL DEFAULT 'Fin de línea base1',
  wbs_col_progress         TEXT NOT NULL DEFAULT '% trabajo completado',
  wbs_col_duration         TEXT NOT NULL DEFAULT 'Duración',
  wbs_col_discipline       TEXT NOT NULL DEFAULT 'Disciplina',
  wbs_col_cwp              TEXT,
  setup_completed          BOOLEAN NOT NULL DEFAULT FALSE,
  setup_step               INT     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. RLS on project_settings (permissive for authenticated users) ───────
ALTER TABLE public.project_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ps_all_authenticated" ON public.project_settings;
CREATE POLICY "ps_all_authenticated" ON public.project_settings
  FOR ALL USING (auth.role() = 'authenticated');

-- ── 4. Auto-create settings row when a project is created ─────────────────
CREATE OR REPLACE FUNCTION public.create_default_project_settings()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.project_settings (project_id)
  VALUES (NEW.id)
  ON CONFLICT (project_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_settings_init ON public.projects;
CREATE TRIGGER trg_project_settings_init
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.create_default_project_settings();

-- ── 5. Back-fill existing projects ────────────────────────────────────────
INSERT INTO public.project_settings (project_id)
SELECT id FROM public.projects
ON CONFLICT (project_id) DO NOTHING;

-- ── 6. Auto-update updated_at ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_project_settings()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_touch_project_settings ON public.project_settings;
CREATE TRIGGER trg_touch_project_settings
  BEFORE UPDATE ON public.project_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_project_settings();
