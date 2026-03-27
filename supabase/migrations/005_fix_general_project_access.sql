-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — Fix General Project Access
-- Assigns the 'Proyecto General' (null UUID) to the first admin user
-- so it respects RLS policies.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_admin_id UUID;
  v_project_id UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  -- 1. Buscar el primer administrador disponible
  SELECT id INTO v_admin_id 
  FROM public.user_profiles 
  WHERE role = 'admin' 
  ORDER BY created_at ASC 
  LIMIT 1;

  -- 2. Si existe un admin, asignar el Proyecto General
  IF v_admin_id IS NOT NULL THEN
    -- Asegurarse de que el proyecto exista (por si acaso no se creó en el seed)
    INSERT INTO public.projects (id, name, description, user_id)
    VALUES (v_project_id, 'Proyecto General', 'Contenedor de datos globales y listados compartidos', v_admin_id)
    ON CONFLICT (id) DO UPDATE 
    SET user_id = EXCLUDED.user_id,
        name = EXCLUDED.name,
        description = EXCLUDED.description
    WHERE public.projects.user_id IS NULL; -- Solo actualizar si no tiene dueño
    
    RAISE NOTICE 'Proyecto General asignado al administrador %', v_admin_id;
  ELSE
    RAISE WARNING 'No se encontró ningún usuario con rol "admin". El Proyecto General sigue sin dueño.';
  END IF;
END $$;
