-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — Fix Platform Admin Project Access
-- Updates the helper function to allow platform admins to bypass ownership checks.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.user_has_project_access(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id
      AND (
        user_id = auth.uid()
        OR public.current_user_is_platform_admin() -- Permitir acceso a administradores de plataforma
        OR EXISTS (
          SELECT 1 FROM public.project_members
          WHERE project_id = p_project_id AND user_id = auth.uid()
        )
      )
  );
$$;
