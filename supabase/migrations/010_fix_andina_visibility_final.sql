-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — FINAL DATA RECOVERY (ANDINA)
-- This migration forces all entities and data to be associated with Andina
-- and grants total read access to authenticated users.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_andina_id UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  -- 1. Garantizar que el proyecto Andina existe con el ID de sistema y es Global
  INSERT INTO public.projects (id, name, user_id)
  VALUES (v_andina_id, 'Andina', NULL)
  ON CONFLICT (id) DO UPDATE SET name = 'Andina', user_id = NULL;

  -- 2. Asegurar que NO existan otros proyectos llamados Andina con IDs distintos que confundan al sistema
  -- Si hay otro proyecto llamado Andina, lo renombramos para evitar duplicados en el selector.
  UPDATE public.projects SET name = 'Andina (Antiguo)' WHERE name = 'Andina' AND id <> v_andina_id;

  -- 3. FORZAR asociación de todas las entidades (tablas) que no tienen proyecto a Andina
  -- Esto recupera las tablas cargadas anteriormente que quedaron "huérfanas".
  UPDATE public.entities SET project_id = v_andina_id WHERE project_id IS NULL;
  
  -- 4. Recuperar vistas personalizadas
  UPDATE public.custom_views SET project_id = v_andina_id WHERE project_id IS NULL;

  -- 5. RLS TOTALMENTE PERMISIVO EN LECTURA
  -- Permitir que cualquier usuario autenticado vea cualquier proyecto
  DROP POLICY IF EXISTS "projects_select" ON public.projects;
  CREATE POLICY "projects_select" ON public.projects FOR SELECT USING (auth.role() = 'authenticated');

  -- 6. ACTUALIZAR FUNCIÓN DE ACCESO para que sea 100% permisiva en lectura
  -- Esto garantiza que las tablas y registros históricos sean visibles para el "Visualizador".
  CREATE OR REPLACE FUNCTION public.user_has_project_access(p_project_id UUID)
  RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE AS $f$
    SELECT (auth.role() = 'authenticated'); -- SI ESTÁ LOGUEADO, PUEDE VER TODO
  $f$;

  RAISE NOTICE 'Recuperación definitiva completada. Proyecto Andina es ahora el contenedor global.';
END $$;
