-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — Rename to Andina and Fix Orphans
-- 1. Renames the primary project to 'Andina'
-- 2. Associates all orphan entities/relationships/views to this project
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_project_id UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  -- 1. Renombrar el proyecto principal a 'Andina'
  -- Buscamos por ID fijo o por el nombre por defecto 'Proyecto General'
  UPDATE public.projects 
  SET name = 'Andina' 
  WHERE id = v_project_id OR (name = 'Proyecto General' AND user_id IS NULL);

  -- 2. Si no existe un proyecto con ese ID, nos aseguramos de que al menos uno se llame Andina
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE name = 'Andina') THEN
    UPDATE public.projects SET name = 'Andina' WHERE id = (SELECT id FROM public.projects LIMIT 1);
  END IF;

  -- 3. Backfill de project_id en datos huérfanos
  -- Esto asegura que las tablas (entities) que no tenían proyecto ahora pertenezcan a Andina
  UPDATE public.entities      SET project_id = (SELECT id FROM public.projects WHERE name = 'Andina' LIMIT 1) WHERE project_id IS NULL;
  UPDATE public.relationships SET project_id = (SELECT id FROM public.projects WHERE name = 'Andina' LIMIT 1) WHERE project_id IS NULL;
  UPDATE public.custom_views  SET project_id = (SELECT id FROM public.projects WHERE name = 'Andina' LIMIT 1) WHERE project_id IS NULL;

  RAISE NOTICE 'Migración a Andina completada y datos huérfanos asociados.';
END $$;
