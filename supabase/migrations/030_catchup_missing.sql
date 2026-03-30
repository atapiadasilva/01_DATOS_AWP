-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — CATCH-UP: Migraciones faltantes 011 + 028 + 029
-- Ejecutar completo en Supabase SQL Editor (una sola pasada)
-- ═══════════════════════════════════════════════════════════════════════════

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- [011] wbs_cwp_mappings: mapeos WBS → CWP persistentes por proyecto
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.wbs_cwp_mappings (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID        REFERENCES public.projects(id) ON DELETE CASCADE,
  edt          TEXT        NOT NULL,
  cwp_name     TEXT        NOT NULL,
  assigned_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, edt)
);

CREATE INDEX IF NOT EXISTS wbs_cwp_mappings_project_edt_idx
  ON public.wbs_cwp_mappings(project_id, edt);

ALTER TABLE public.wbs_cwp_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mappings_select" ON public.wbs_cwp_mappings;
CREATE POLICY "mappings_select" ON public.wbs_cwp_mappings
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "mappings_insert" ON public.wbs_cwp_mappings;
CREATE POLICY "mappings_insert" ON public.wbs_cwp_mappings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "mappings_update" ON public.wbs_cwp_mappings;
CREATE POLICY "mappings_update" ON public.wbs_cwp_mappings
  FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "mappings_delete" ON public.wbs_cwp_mappings;
CREATE POLICY "mappings_delete" ON public.wbs_cwp_mappings
  FOR DELETE USING (auth.role() = 'authenticated');

DO $$ BEGIN RAISE NOTICE '✓ [011] wbs_cwp_mappings creada.'; END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- [028] project_settings: columna wbs_col_hh para horas hombre
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE public.project_settings
  ADD COLUMN IF NOT EXISTS wbs_col_hh TEXT;

DO $$ BEGIN RAISE NOTICE '✓ [028] project_settings.wbs_col_hh agregada.'; END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- [029] Integridad de datos: triggers, índices, RPC atómica
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- project_id NOT NULL en weekly_plan_activities (solo si no hay NULLs)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.weekly_plan_activities WHERE project_id IS NULL LIMIT 1
  ) THEN
    ALTER TABLE public.weekly_plan_activities
      ALTER COLUMN project_id SET NOT NULL;
    RAISE NOTICE '✓ [029] weekly_plan_activities.project_id = NOT NULL.';
  ELSE
    RAISE NOTICE '⚠️  [029] Hay filas con project_id NULL — NOT NULL omitido.';
  END IF;
END $$;

-- Función: normalizar EDT (trim whitespace)
CREATE OR REPLACE FUNCTION public.normalize_edt_mapping()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.edt = trim(NEW.edt);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_edt ON public.wbs_cwp_mappings;
CREATE TRIGGER trg_normalize_edt
  BEFORE INSERT OR UPDATE ON public.wbs_cwp_mappings
  FOR EACH ROW EXECUTE FUNCTION public.normalize_edt_mapping();

DROP TRIGGER IF EXISTS trg_normalize_edt_wbs ON public.aps_wbs_links;
CREATE TRIGGER trg_normalize_edt_wbs
  BEFORE INSERT OR UPDATE ON public.aps_wbs_links
  FOR EACH ROW EXECUTE FUNCTION public.normalize_edt_mapping();

DO $$ BEGIN RAISE NOTICE '✓ [029] Triggers normalize_edt creados.'; END $$;

-- Función + trigger: cascade al borrar CWP del catálogo
CREATE OR REPLACE FUNCTION public.cascade_cwp_master_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.aps_element_links
    SET cwp_code = ''
  WHERE project_id = OLD.project_id AND cwp_code = OLD.cwp_code;

  UPDATE public.wbs_cwp_mappings
    SET cwp_name = ''
  WHERE project_id = OLD.project_id AND cwp_name = OLD.cwp_code;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_cwp_delete ON public.cwp_master;
CREATE TRIGGER trg_cascade_cwp_delete
  BEFORE DELETE ON public.cwp_master
  FOR EACH ROW EXECUTE FUNCTION public.cascade_cwp_master_delete();

DO $$ BEGIN RAISE NOTICE '✓ [029] Trigger cascade_cwp_delete en cwp_master creado.'; END $$;

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_wpa_project_id
  ON public.weekly_plan_activities(project_id);
CREATE INDEX IF NOT EXISTS idx_wpl_activity_id
  ON public.weekly_plan_links(activity_id);
CREATE INDEX IF NOT EXISTS idx_wpl_project_external
  ON public.weekly_plan_links(project_id, external_id);
CREATE INDEX IF NOT EXISTS idx_awl_project_wbs
  ON public.aps_wbs_links(project_id, wbs_id);
CREATE INDEX IF NOT EXISTS idx_dr_entity_id
  ON public.data_records(entity_id);

DO $$ BEGIN RAISE NOTICE '✓ [029] Índices de rendimiento creados.'; END $$;

-- RPC atómica: crear actividad + links BIM en una sola transacción
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

DO $$ BEGIN RAISE NOTICE '✓ [029] RPC assign_activity_with_links creada.'; END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO $$ BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'CATCH-UP completado. Verifica que todos los mensajes';
  RAISE NOTICE 'anteriores muestren ✓ (sin ⚠️).';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;
