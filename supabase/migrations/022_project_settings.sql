-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — Project Settings
-- Stores per-project configuration: APS model URN + WBS column mappings.
-- Run in Supabase SQL Editor after migration 021.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Table ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_settings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL UNIQUE
                          REFERENCES public.projects(id) ON DELETE CASCADE,

  -- ── APS / Autodesk model ─────────────────────────────────────────────
  aps_model_urn   TEXT,          -- base64 URN for the APS Viewer
  aps_model_name  TEXT,          -- display name (e.g. "ANDINA VCAD 27-01-26.nwd")

  -- ── WBS entity ──────────────────────────────────────────────────────
  -- Name of the entities row that holds the schedule upload for this project.
  -- Default matches the existing upload for the first project.
  wbs_entity_name TEXT NOT NULL DEFAULT 'PROGRAMA DE OBRA ACTUALIZADO',

  -- ── WBS column mappings ──────────────────────────────────────────────
  -- Each project can have its own column names in the uploaded schedule.
  -- NULL means "use the default value listed here".
  wbs_col_edt              TEXT NOT NULL DEFAULT 'EDT',
  wbs_col_name             TEXT NOT NULL DEFAULT 'Nombre de tarea',
  wbs_col_start            TEXT NOT NULL DEFAULT 'Comienzo Actual',
  wbs_col_end              TEXT NOT NULL DEFAULT 'Fin Actual',
  wbs_col_baseline_start   TEXT NOT NULL DEFAULT 'Comienzo de línea base1',
  wbs_col_baseline_end     TEXT NOT NULL DEFAULT 'Fin de línea base1',
  wbs_col_progress         TEXT NOT NULL DEFAULT '% trabajo completado',
  wbs_col_duration         TEXT NOT NULL DEFAULT 'Duración',
  wbs_col_discipline       TEXT NOT NULL DEFAULT 'Disciplina',
  wbs_col_cwp              TEXT,          -- optional: CWP column if present in schedule

  -- ── Setup status ─────────────────────────────────────────────────────
  setup_completed  BOOLEAN NOT NULL DEFAULT FALSE,
  setup_step       INT     NOT NULL DEFAULT 0,   -- 0=not started, 1=basic, 2=model, 3=wbs

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_project_settings()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_project_settings ON public.project_settings;
CREATE TRIGGER trg_touch_project_settings
  BEFORE UPDATE ON public.project_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_project_settings();

-- Index for fast project lookup
CREATE INDEX IF NOT EXISTS idx_project_settings_project
  ON public.project_settings(project_id);

-- ── 2. Row-Level Security ─────────────────────────────────────────────────

ALTER TABLE public.project_settings ENABLE ROW LEVEL SECURITY;

-- Any project member can read settings
DROP POLICY IF EXISTS "ps_select" ON public.project_settings;
CREATE POLICY "ps_select" ON public.project_settings
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    user_has_project_access(project_id)
  );

-- Only owner or project admin/editor can write
DROP POLICY IF EXISTS "ps_insert" ON public.project_settings;
CREATE POLICY "ps_insert" ON public.project_settings
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = project_settings.project_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'editor')
    )
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND is_platform_admin = TRUE
    )
  );

DROP POLICY IF EXISTS "ps_update" ON public.project_settings;
CREATE POLICY "ps_update" ON public.project_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = project_settings.project_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'editor')
    )
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND is_platform_admin = TRUE
    )
  );

DROP POLICY IF EXISTS "ps_delete" ON public.project_settings;
CREATE POLICY "ps_delete" ON public.project_settings
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND is_platform_admin = TRUE
    )
  );

-- ── 3. Auto-create settings row when a project is created ─────────────────

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

-- ── 4. Back-fill existing projects ────────────────────────────────────────

INSERT INTO public.project_settings (project_id)
SELECT id FROM public.projects
ON CONFLICT (project_id) DO NOTHING;
