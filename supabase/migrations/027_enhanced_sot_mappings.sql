-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — Enhanced SOT Mappings
-- Adds support for name-based attribute mapping to ensure robustness.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sot_mappings
  ADD COLUMN IF NOT EXISTS source_attribute_name TEXT;

-- Migration: if source_attribute_id exists, we could try to backfill,
-- but since the feature wasn't used yet, it's safer to just start clean.

-- Make source_attribute_id optional since we'll prefer name-based mapping
ALTER TABLE public.sot_mappings 
  ALTER COLUMN source_attribute_id DROP NOT NULL;
