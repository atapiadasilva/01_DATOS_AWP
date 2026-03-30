-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — Add wbs_col_hh to project_settings
-- Allows configuring which column holds man-hours (HH) per activity.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.project_settings
  ADD COLUMN IF NOT EXISTS wbs_col_hh TEXT;
