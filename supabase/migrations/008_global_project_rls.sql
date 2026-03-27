-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — Global Project RLS Adjustments
-- 1. Updates user_has_project_access to allow projects with no owner (Global)
-- 2. Updates projects_select policy
-- 3. Makes 'Andina' a global project
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Helper function update ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_has_project_access(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id
      AND (
        user_id = auth.uid()            -- Es el dueño
        OR user_id IS NULL               -- ES UN PROYECTO GLOBAL/SISTEMA
        OR EXISTS (                      -- Es un miembro invitado
          SELECT 1 FROM public.project_members
          WHERE project_id = p_project_id AND user_id = auth.uid()
        )
      )
  );
$$;

-- ── 2. Project policy update ───────────────────────────────────────────────
DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (
      user_id = auth.uid()
      OR user_id IS NULL -- Visibilidad para proyectos globales
      OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = id AND pm.user_id = auth.uid()
      )
    )
  );

-- ── 3. Make Andina Global ─────────────────────────────────────────────────
-- Al poner user_id en NULL, el proyecto se vuelve "Global" según nuestras nuevas reglas.
UPDATE public.projects 
SET user_id = NULL 
WHERE name = 'Andina' OR id = '00000000-0000-0000-0000-000000000000';

-- ── 4. Ensure Entities are linked to it (per 007) ──────────────────────────
UPDATE public.entities SET project_id = (SELECT id FROM public.projects WHERE name = 'Andina' LIMIT 1) WHERE project_id IS NULL;
