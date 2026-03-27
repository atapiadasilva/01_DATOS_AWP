-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — RLS for core data tables
-- Run this in the Supabase SQL Editor AFTER 001_saas_schema.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Helper: project access check ──────────────────────────────────────────
-- SECURITY DEFINER so it can read projects/project_members without hitting
-- their own RLS policies during the check.
CREATE OR REPLACE FUNCTION public.user_has_project_access(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id
      AND (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.project_members
          WHERE project_id = p_project_id AND user_id = auth.uid()
        )
      )
  );
$$;

-- ── entities ──────────────────────────────────────────────────────────────
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entities_select" ON public.entities;
CREATE POLICY "entities_select" ON public.entities
  FOR SELECT USING (auth.role() = 'authenticated' AND public.user_has_project_access(project_id));

DROP POLICY IF EXISTS "entities_insert" ON public.entities;
CREATE POLICY "entities_insert" ON public.entities
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND public.user_has_project_access(project_id));

DROP POLICY IF EXISTS "entities_update" ON public.entities;
CREATE POLICY "entities_update" ON public.entities
  FOR UPDATE USING (auth.role() = 'authenticated' AND public.user_has_project_access(project_id));

DROP POLICY IF EXISTS "entities_delete" ON public.entities;
CREATE POLICY "entities_delete" ON public.entities
  FOR DELETE USING (auth.role() = 'authenticated' AND public.user_has_project_access(project_id));

-- ── data_records ──────────────────────────────────────────────────────────
ALTER TABLE public.data_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "records_select" ON public.data_records;
CREATE POLICY "records_select" ON public.data_records
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_id AND public.user_has_project_access(e.project_id)
    )
  );

DROP POLICY IF EXISTS "records_insert" ON public.data_records;
CREATE POLICY "records_insert" ON public.data_records
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_id AND public.user_has_project_access(e.project_id)
    )
  );

DROP POLICY IF EXISTS "records_update" ON public.data_records;
CREATE POLICY "records_update" ON public.data_records
  FOR UPDATE USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_id AND public.user_has_project_access(e.project_id)
    )
  );

DROP POLICY IF EXISTS "records_delete" ON public.data_records;
CREATE POLICY "records_delete" ON public.data_records
  FOR DELETE USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_id AND public.user_has_project_access(e.project_id)
    )
  );

-- ── attributes ────────────────────────────────────────────────────────────
ALTER TABLE public.attributes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attributes_select" ON public.attributes;
CREATE POLICY "attributes_select" ON public.attributes
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_id AND public.user_has_project_access(e.project_id)
    )
  );

DROP POLICY IF EXISTS "attributes_insert" ON public.attributes;
CREATE POLICY "attributes_insert" ON public.attributes
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_id AND public.user_has_project_access(e.project_id)
    )
  );

DROP POLICY IF EXISTS "attributes_update" ON public.attributes;
CREATE POLICY "attributes_update" ON public.attributes
  FOR UPDATE USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_id AND public.user_has_project_access(e.project_id)
    )
  );

DROP POLICY IF EXISTS "attributes_delete" ON public.attributes;
CREATE POLICY "attributes_delete" ON public.attributes
  FOR DELETE USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_id AND public.user_has_project_access(e.project_id)
    )
  );

-- ── relationships ─────────────────────────────────────────────────────────
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "relationships_select" ON public.relationships;
CREATE POLICY "relationships_select" ON public.relationships
  FOR SELECT USING (auth.role() = 'authenticated' AND public.user_has_project_access(project_id));

DROP POLICY IF EXISTS "relationships_insert" ON public.relationships;
CREATE POLICY "relationships_insert" ON public.relationships
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND public.user_has_project_access(project_id));

DROP POLICY IF EXISTS "relationships_update" ON public.relationships;
CREATE POLICY "relationships_update" ON public.relationships
  FOR UPDATE USING (auth.role() = 'authenticated' AND public.user_has_project_access(project_id));

DROP POLICY IF EXISTS "relationships_delete" ON public.relationships;
CREATE POLICY "relationships_delete" ON public.relationships
  FOR DELETE USING (auth.role() = 'authenticated' AND public.user_has_project_access(project_id));

-- ── custom_views ──────────────────────────────────────────────────────────
ALTER TABLE public.custom_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "views_select" ON public.custom_views;
CREATE POLICY "views_select" ON public.custom_views
  FOR SELECT USING (auth.role() = 'authenticated' AND public.user_has_project_access(project_id));

DROP POLICY IF EXISTS "views_insert" ON public.custom_views;
CREATE POLICY "views_insert" ON public.custom_views
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND public.user_has_project_access(project_id));

DROP POLICY IF EXISTS "views_update" ON public.custom_views;
CREATE POLICY "views_update" ON public.custom_views
  FOR UPDATE USING (auth.role() = 'authenticated' AND public.user_has_project_access(project_id));

DROP POLICY IF EXISTS "views_delete" ON public.custom_views;
CREATE POLICY "views_delete" ON public.custom_views
  FOR DELETE USING (auth.role() = 'authenticated' AND public.user_has_project_access(project_id));

-- ── Revoke anon access to core tables ─────────────────────────────────────
-- The RLS policies already block anon via auth.role() checks, but it is good
-- practice to remove the PostgreSQL-level grant as well.
REVOKE ALL ON public.entities      FROM anon;
REVOKE ALL ON public.data_records  FROM anon;
REVOKE ALL ON public.attributes    FROM anon;
REVOKE ALL ON public.relationships FROM anon;
REVOKE ALL ON public.custom_views  FROM anon;
