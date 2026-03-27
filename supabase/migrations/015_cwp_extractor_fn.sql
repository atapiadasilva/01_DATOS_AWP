-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — RPC: Extractor de valores únicos desde registros
-- Permite extraer combinaciones únicas de CWP/disciplina/EWP/PWP
-- desde los datos ingestados para poblar el catálogo maestro.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.extract_cwp_combinations(
  p_entity_id   UUID,
  p_cwp_col     TEXT,
  p_desc_col    TEXT DEFAULT NULL,
  p_disc_col    TEXT DEFAULT NULL,
  p_ewp_col     TEXT DEFAULT NULL,
  p_pwp_col     TEXT DEFAULT NULL
)
RETURNS TABLE(
  cwp_code        TEXT,
  cwp_description TEXT,
  discipline      TEXT,
  ewp_code        TEXT,
  pwp_code        TEXT,
  row_count       BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    UPPER(TRIM(data->>p_cwp_col))                                          AS cwp_code,
    COALESCE(MAX(TRIM(data->>p_desc_col)), '')                             AS cwp_description,
    UPPER(COALESCE(MAX(TRIM(data->>p_disc_col)), ''))                      AS discipline,
    UPPER(COALESCE(MAX(TRIM(data->>p_ewp_col)), ''))                       AS ewp_code,
    UPPER(COALESCE(MAX(TRIM(data->>p_pwp_col)), ''))                       AS pwp_code,
    COUNT(*)                                                               AS row_count
  FROM public.records
  WHERE entity_id = p_entity_id
    AND data->>p_cwp_col IS NOT NULL
    AND TRIM(data->>p_cwp_col) <> ''
  GROUP BY UPPER(TRIM(data->>p_cwp_col))
  ORDER BY row_count DESC, cwp_code ASC;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION public.extract_cwp_combinations TO authenticated;
