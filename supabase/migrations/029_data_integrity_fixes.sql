-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — Data Integrity Fixes (029)  — versión defensiva
-- Cada sección verifica que la tabla exista antes de actuar.
-- Seguro de ejecutar aunque falten migraciones anteriores.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. sort_order en weekly_plan_activities ────────────────────────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'weekly_plan_activities'
  ) THEN
    ALTER TABLE public.weekly_plan_activities
      ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ── 2. project_id NOT NULL en weekly_plan_activities ─────────────────────
-- Solo si no hay filas con project_id nulo
DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'weekly_plan_activities'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.weekly_plan_activities WHERE project_id IS NULL LIMIT 1
    ) THEN
      ALTER TABLE public.weekly_plan_activities
        ALTER COLUMN project_id SET NOT NULL;
    ELSE
      RAISE NOTICE '⚠️  weekly_plan_activities tiene filas con project_id NULL — omitiendo NOT NULL constraint.';
    END IF;
  END IF;
END $$;

-- ── 3. Función de normalización EDT ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_edt_mapping()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.edt = trim(NEW.edt);
  RETURN NEW;
END;
$$;

-- Trigger en wbs_cwp_mappings (si existe)
DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'wbs_cwp_mappings'
  ) THEN
    DROP TRIGGER IF EXISTS trg_normalize_edt ON public.wbs_cwp_mappings;
    CREATE TRIGGER trg_normalize_edt
      BEFORE INSERT OR UPDATE ON public.wbs_cwp_mappings
      FOR EACH ROW EXECUTE FUNCTION public.normalize_edt_mapping();
    RAISE NOTICE '✓ Trigger normalize_edt en wbs_cwp_mappings creado.';
  ELSE
    RAISE NOTICE '⚠️  wbs_cwp_mappings no existe — trigger omitido. Ejecuta primero 011_wbs_cwp_mapping_table.sql';
  END IF;
END $$;

-- Trigger en aps_wbs_links (si existe)
DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'aps_wbs_links'
  ) THEN
    DROP TRIGGER IF EXISTS trg_normalize_edt_wbs ON public.aps_wbs_links;
    CREATE TRIGGER trg_normalize_edt_wbs
      BEFORE INSERT OR UPDATE ON public.aps_wbs_links
      FOR EACH ROW EXECUTE FUNCTION public.normalize_edt_mapping();
    RAISE NOTICE '✓ Trigger normalize_edt en aps_wbs_links creado.';
  ELSE
    RAISE NOTICE '⚠️  aps_wbs_links no existe — trigger omitido.';
  END IF;
END $$;

-- ── 4. Cascade lógico al borrar un CWP del catálogo ──────────────────────
CREATE OR REPLACE FUNCTION public.cascade_cwp_master_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'aps_element_links') THEN
    UPDATE public.aps_element_links
      SET cwp_code = ''
    WHERE project_id = OLD.project_id AND cwp_code = OLD.cwp_code;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'wbs_cwp_mappings') THEN
    UPDATE public.wbs_cwp_mappings
      SET cwp_name = ''
    WHERE project_id = OLD.project_id AND cwp_name = OLD.cwp_code;
  END IF;

  RETURN OLD;
END;
$$;

DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cwp_master'
  ) THEN
    DROP TRIGGER IF EXISTS trg_cascade_cwp_delete ON public.cwp_master;
    CREATE TRIGGER trg_cascade_cwp_delete
      BEFORE DELETE ON public.cwp_master
      FOR EACH ROW EXECUTE FUNCTION public.cascade_cwp_master_delete();
    RAISE NOTICE '✓ Trigger cascade_cwp_delete en cwp_master creado.';
  ELSE
    RAISE NOTICE '⚠️  cwp_master no existe — trigger omitido.';
  END IF;
END $$;

-- ── 5. Índices de rendimiento ─────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'weekly_plan_activities') THEN
    CREATE INDEX IF NOT EXISTS idx_wpa_project_id
      ON public.weekly_plan_activities(project_id);
    RAISE NOTICE '✓ Índice idx_wpa_project_id creado.';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'weekly_plan_links') THEN
    CREATE INDEX IF NOT EXISTS idx_wpl_activity_id
      ON public.weekly_plan_links(activity_id);
    CREATE INDEX IF NOT EXISTS idx_wpl_project_external
      ON public.weekly_plan_links(project_id, external_id);
    RAISE NOTICE '✓ Índices weekly_plan_links creados.';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'aps_wbs_links') THEN
    CREATE INDEX IF NOT EXISTS idx_awl_project_wbs
      ON public.aps_wbs_links(project_id, wbs_id);
    RAISE NOTICE '✓ Índice idx_awl_project_wbs creado.';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'data_records') THEN
    CREATE INDEX IF NOT EXISTS idx_dr_entity_id
      ON public.data_records(entity_id);
    RAISE NOTICE '✓ Índice idx_dr_entity_id creado.';
  END IF;
END $$;

-- ── 6. RPC atómica: crear actividad + links BIM en una sola transacción ───
DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'weekly_plan_activities'
  ) THEN
    -- La función se crea via CREATE OR REPLACE fuera del DO block
    RAISE NOTICE '✓ weekly_plan_activities existe — creando función RPC.';
  ELSE
    RAISE NOTICE '⚠️  weekly_plan_activities no existe — función RPC omitida.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.assign_activity_with_links(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_activity_id uuid;
  v_link        jsonb;
BEGIN
  INSERT INTO public.weekly_plan_activities (
    project_id, title, discipline, start_date, end_date,
    progress, wbs_edt, wbs_name, notes, color, sort_order
  )
  VALUES (
    (payload->>'project_id')::uuid,
    payload->>'title',
    coalesce(payload->>'discipline', ''),
    (payload->>'start_date')::date,
    (payload->>'end_date')::date,
    coalesce((payload->>'progress')::int, 0),
    coalesce(payload->>'wbs_edt', ''),
    coalesce(payload->>'wbs_name', ''),
    coalesce(payload->>'notes', ''),
    coalesce(payload->>'color', ''),
    coalesce((payload->>'sort_order')::int, 0)
  )
  RETURNING id INTO v_activity_id;

  IF payload ? 'links' AND jsonb_array_length(payload->'links') > 0 THEN
    FOR v_link IN SELECT * FROM jsonb_array_elements(payload->'links')
    LOOP
      INSERT INTO public.weekly_plan_links (activity_id, project_id, model_urn, external_id)
      VALUES (
        v_activity_id,
        (payload->>'project_id')::uuid,
        v_link->>'model_urn',
        v_link->>'external_id'
      )
      ON CONFLICT (activity_id, model_urn, external_id) DO NOTHING;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('id', v_activity_id, 'ok', true);
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

COMMENT ON FUNCTION public.assign_activity_with_links IS
  'Crea actividad del plan semanal + vínculos BIM en una sola transacción atómica.';

-- ── Resumen final ─────────────────────────────────────────────────────────
DO $$ BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════';
  RAISE NOTICE 'Migración 029 completada. Revisa los mensajes arriba.';
  RAISE NOTICE 'Tablas que deben existir para cobertura completa:';
  RAISE NOTICE '  011_wbs_cwp_mapping_table.sql  → wbs_cwp_mappings';
  RAISE NOTICE '  016_bim.sql / 019_aps_wbs_links.sql → aps_wbs_links';
  RAISE NOTICE '  018_aps_element_links.sql       → aps_element_links';
  RAISE NOTICE '  014_cwp_master.sql              → cwp_master';
  RAISE NOTICE '═══════════════════════════════════════════════════';
END $$;
