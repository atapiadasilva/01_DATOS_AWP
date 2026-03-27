-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — Backfill project_id on custom_views
-- Run this in the Supabase SQL Editor to fix views saved without project_id.
-- ═══════════════════════════════════════════════════════════════════════════

-- Update custom_views that have NULL project_id by looking up the
-- project_id from the linked entity.
UPDATE public.custom_views cv
SET project_id = e.project_id
FROM public.entities e
WHERE cv.entity_id = e.id
  AND cv.project_id IS NULL;
