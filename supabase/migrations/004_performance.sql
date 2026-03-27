-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — Performance: indexes + server-side audit RPC
-- Run this in the Supabase SQL Editor AFTER 003_rls_core_tables.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Critical indexes ──────────────────────────────────────────────────────
-- data_records is the hottest table; queried on entity_id everywhere
CREATE INDEX IF NOT EXISTS idx_data_records_entity_id
  ON public.data_records(entity_id);

-- DataEditor loads records ordered by created_at DESC per entity
CREATE INDEX IF NOT EXISTS idx_data_records_entity_created
  ON public.data_records(entity_id, created_at DESC);

-- Attributes are joined to entities on every entity load
CREATE INDEX IF NOT EXISTS idx_attributes_entity_id
  ON public.attributes(entity_id);

-- Ingest looks up entities by (project_id, name)
CREATE INDEX IF NOT EXISTS idx_entities_project_name
  ON public.entities(project_id, name);

-- CWP photo gallery filters by uploader
CREATE INDEX IF NOT EXISTS idx_cwp_photos_uploaded_by
  ON public.cwp_photos(uploaded_by);

-- ── Server-side integrity audit ───────────────────────────────────────────
-- Replaces the in-memory JavaScript join in audit-utils.ts with a single
-- SQL query. Runs 10-100x faster on large tables.
CREATE OR REPLACE FUNCTION public.run_integrity_audit(
  p_parent_entity_id UUID,
  p_child_entity_id  UUID,
  p_parent_col       TEXT,
  p_child_col        TEXT
)
RETURNS TABLE (
  total_child BIGINT,
  matched     BIGINT,
  orphans     BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN QUERY
  WITH parent_set AS (
    -- Collect distinct normalised parent key values
    SELECT DISTINCT LOWER(TRIM(data->>p_parent_col)) AS val
    FROM   public.data_records
    WHERE  entity_id = p_parent_entity_id
      AND  data->>p_parent_col IS NOT NULL
      AND  TRIM(data->>p_parent_col) <> ''
  )
  SELECT
    COUNT(*)::BIGINT                                        AS total_child,
    COUNT(ps.val)::BIGINT                                   AS matched,
    (COUNT(*) - COUNT(ps.val))::BIGINT                      AS orphans
  FROM public.data_records dr
  LEFT JOIN parent_set ps
         ON LOWER(TRIM(dr.data->>p_child_col)) = ps.val
  WHERE dr.entity_id = p_child_entity_id;
END;
$$;
