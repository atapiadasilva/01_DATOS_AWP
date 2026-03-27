-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — Total Visibility RLS
-- Opening read access to all projects and their data for authenticated users
-- to satisfy the "total visualization permissions" requirement.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Global Project Select Policy ───────────────────────────────────────
DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects
  FOR SELECT USING (auth.role() = 'authenticated');

-- ── 2. Permissive Access Check Function ────────────────────────────────────
-- This function is used by entities, records, attributes, etc.
-- By allowing all authenticated users, we grant read access across the board.
CREATE OR REPLACE FUNCTION public.user_has_project_access(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id
      AND (auth.role() = 'authenticated')
  );
$$;

-- ── 3. Reset Andina to be Global (no specific owner needed for visibility) ──
UPDATE public.projects SET user_id = NULL WHERE name = 'Andina';

RAISE NOTICE 'RLS de lectura global aplicado. Visibilidad total concedida para usuarios autenticados.';
