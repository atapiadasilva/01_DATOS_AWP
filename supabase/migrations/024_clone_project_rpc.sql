-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — Clone Project Structure RPC (V3 - Ultra Stability)
-- Clones entities, attributes, custom views, relationships, settings,
-- CWP Master, and WBS-CWP Mappings.
-- ENSURES TOTAL ISOLATION AND ATOMICITY.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.clone_project_structure(
  p_source_id UUID,
  p_new_name TEXT,
  p_desc TEXT,
  p_user_id UUID,
  p_clone_data BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_project_id UUID;
  v_ent RECORD;
  v_new_ent_id UUID;
  v_attr RECORD;
  v_new_attr_id UUID;
  v_source_exists BOOLEAN;
BEGIN
  -- 1. Security check: Only platform admins
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_platform_admin = TRUE) THEN
    RAISE EXCEPTION 'Acceso denegado. Solo administradores de plataforma pueden clonar proyectos.';
  END IF;

  -- 2. Verify source exists
  SELECT EXISTS(SELECT 1 FROM public.projects WHERE id = p_source_id) INTO v_source_exists;
  IF NOT v_source_exists THEN
    RAISE EXCEPTION 'El proyecto origen no existe (ID: %)', p_source_id;
  END IF;

  -- 3. Create the new project entry
  INSERT INTO public.projects (name, description, user_id, status)
  VALUES (COALESCE(TRIM(p_new_name), 'Nuevo Proyecto'), TRIM(p_desc), p_user_id, 'active')
  RETURNING id INTO v_new_project_id;

  -- 4. Add owner membership
  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (v_new_project_id, p_user_id, 'admin')
  ON CONFLICT (project_id, user_id) DO NOTHING;

  -- 5. Clone Project Settings (Using INSERT ON CONFLICT to avoid race with trigger)
  INSERT INTO public.project_settings (
    project_id, aps_model_urn, aps_model_name, wbs_entity_name, 
    wbs_col_edt, wbs_col_name, wbs_col_start, wbs_col_end,
    wbs_col_baseline_start, wbs_col_baseline_end, wbs_col_progress,
    wbs_col_duration, wbs_col_discipline, wbs_col_cwp,
    setup_completed, setup_step
  )
  SELECT 
    v_new_project_id, aps_model_urn, aps_model_name, wbs_entity_name, 
    wbs_col_edt, wbs_col_name, wbs_col_start, wbs_col_end,
    wbs_col_baseline_start, wbs_col_baseline_end, wbs_col_progress,
    wbs_col_duration, wbs_col_discipline, wbs_col_cwp,
    setup_completed, setup_step
  FROM public.project_settings WHERE project_id = p_source_id
  ON CONFLICT (project_id) DO UPDATE SET
    aps_model_urn = EXCLUDED.aps_model_urn,
    aps_model_name = EXCLUDED.aps_model_name,
    wbs_entity_name = EXCLUDED.wbs_entity_name,
    wbs_col_edt = EXCLUDED.wbs_col_edt,
    wbs_col_name = EXCLUDED.wbs_col_name,
    wbs_col_start = EXCLUDED.wbs_col_start,
    wbs_col_end = EXCLUDED.wbs_col_end,
    wbs_col_baseline_start = EXCLUDED.wbs_col_baseline_start,
    wbs_col_baseline_end = EXCLUDED.wbs_col_baseline_end,
    wbs_col_progress = EXCLUDED.wbs_col_progress,
    wbs_col_duration = EXCLUDED.wbs_col_duration,
    wbs_col_discipline = EXCLUDED.wbs_col_discipline,
    wbs_col_cwp = EXCLUDED.wbs_col_cwp,
    setup_completed = EXCLUDED.setup_completed,
    setup_step = EXCLUDED.setup_step;

  -- 6. Maps for deep cloning
  CREATE TEMP TABLE tmp_entity_map (old_id UUID, new_id UUID) ON COMMIT DROP;
  CREATE TEMP TABLE tmp_attr_map (old_id UUID, new_id UUID)   ON COMMIT DROP;

  -- 7. Clone CWP Master
  INSERT INTO public.cwp_master (project_id, cwp_code, cwp_description, discipline, ewp_code, pwp_code, tags, area, is_active, sort_order)
  SELECT v_new_project_id, cwp_code, cwp_description, discipline, ewp_code, pwp_code, tags, area, is_active, sort_order
  FROM public.cwp_master
  WHERE project_id = p_source_id;

  -- 8. Clone WBS-CWP Mappings
  INSERT INTO public.wbs_cwp_mappings (project_id, edt, cwp_name, assigned_by)
  SELECT v_new_project_id, edt, cwp_name, p_user_id
  FROM public.wbs_cwp_mappings
  WHERE project_id = p_source_id;

  -- 9. Clone Entities and their Attributes
  FOR v_ent IN SELECT * FROM public.entities WHERE project_id = p_source_id LOOP
    INSERT INTO public.entities (project_id, name, file_type, position_x, position_y)
    VALUES (v_new_project_id, v_ent.name, v_ent.file_type, v_ent.position_x, v_ent.position_y)
    RETURNING id INTO v_new_ent_id;

    INSERT INTO tmp_entity_map (old_id, new_id) VALUES (v_ent.id, v_new_ent_id);

    FOR v_attr IN SELECT * FROM public.attributes WHERE entity_id = v_ent.id LOOP
      INSERT INTO public.attributes (entity_id, name, data_type, is_pk)
      VALUES (v_new_ent_id, v_attr.name, v_attr.data_type, v_attr.is_pk)
      RETURNING id INTO v_new_attr_id;

      INSERT INTO tmp_attr_map (old_id, new_id) VALUES (v_attr.id, v_new_attr_id);
    END LOOP;
  END LOOP;

  -- 10. Clone Relationships (Re-mapped)
  INSERT INTO public.relationships (project_id, parent_attribute_id, child_attribute_id, cardinality, join_type)
  SELECT v_new_project_id, ms.new_id, mt.new_id, r.cardinality, r.join_type
  FROM public.relationships r
  JOIN tmp_attr_map ms ON ms.old_id = r.parent_attribute_id
  JOIN tmp_attr_map mt ON mt.old_id = r.child_attribute_id
  WHERE r.project_id = p_source_id;

  -- 11. Optional Data Clone
  IF p_clone_data THEN
    INSERT INTO public.data_records (entity_id, pk_value, data)
    SELECT m.new_id, dr.pk_value, dr.data
    FROM public.data_records dr
    JOIN tmp_entity_map m ON m.old_id = dr.entity_id;
  END IF;

  RETURN v_new_project_id;
END;
$$;
