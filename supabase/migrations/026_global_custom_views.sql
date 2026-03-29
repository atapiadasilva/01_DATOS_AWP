-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — Global Custom Views
-- Allows views to be shared across projects by name-matching.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.custom_views
  ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS entity_name TEXT;

-- Update RLS to allow seeing global views
DROP POLICY IF EXISTS "views_select" ON public.custom_views;
CREATE POLICY "views_select" ON public.custom_views
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (
      is_global = TRUE
      OR public.user_has_project_access(project_id)
    )
  );

-- Update RLS for insertion: only platform admins can create global views
DROP POLICY IF EXISTS "views_insert" ON public.custom_views;
CREATE POLICY "views_insert" ON public.custom_views
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' AND (
      (is_global = FALSE AND public.user_has_project_access(project_id))
      OR (is_global = TRUE AND public.current_user_is_platform_admin())
    )
  );

DROP POLICY IF EXISTS "views_update" ON public.custom_views;
CREATE POLICY "views_update" ON public.custom_views
  FOR UPDATE USING (
    auth.role() = 'authenticated' AND (
      (is_global = FALSE AND public.user_has_project_access(project_id))
      OR (is_global = TRUE AND public.current_user_is_platform_admin())
    )
  );
