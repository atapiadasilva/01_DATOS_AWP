-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — Expand CWP Master Schema
-- Adds tags and area metadata to CWPs.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.cwp_master 
  ADD COLUMN IF NOT EXISTS tags TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS area TEXT NOT NULL DEFAULT '';

-- Update extraction function to handle tags and area
CREATE OR REPLACE FUNCTION public.extract_cwp_combinations(
  p_entity_id UUID,
  p_cwp_col     TEXT,
  p_desc_col    TEXT DEFAULT NULL,
  p_disc_col    TEXT DEFAULT NULL,
  p_ewp_col     TEXT DEFAULT NULL,
  p_pwp_col     TEXT DEFAULT NULL,
  p_area_col    TEXT DEFAULT NULL,
  p_tags_col    TEXT DEFAULT NULL
)
RETURNS TABLE (
  cwp_code        TEXT,
  cwp_description TEXT,
  discipline      TEXT,
  ewp_code        TEXT,
  pwp_code        TEXT,
  area            TEXT,
  tags            TEXT,
  row_count       BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    UPPER(TRIM(data->>p_cwp_col))                                          AS cwp_code,
    COALESCE(MAX(TRIM(data->>p_desc_col)), '')                             AS cwp_description,
    COALESCE(MAX(UPPER(TRIM(data->>p_disc_col))), '')                      AS discipline,
    COALESCE(MAX(UPPER(TRIM(data->>p_ewp_col))), '')                       AS ewp_code,
    COALESCE(MAX(UPPER(TRIM(data->>p_pwp_col))), '')                       AS pwp_code,
    COALESCE(MAX(UPPER(TRIM(data->>p_area_col))), '')                      AS area,
    COALESCE(MAX(TRIM(data->>p_tags_col)), '')                             AS tags,
    COUNT(*)::BIGINT                                                       AS row_count
  FROM public.data_records
  WHERE entity_id = p_entity_id
    AND data->>p_cwp_col IS NOT NULL
    AND TRIM(data->>p_cwp_col) <> ''
  GROUP BY UPPER(TRIM(data->>p_cwp_col))
  ORDER BY row_count DESC, cwp_code ASC;
END;
$$;
