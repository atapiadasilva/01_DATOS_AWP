-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — CWP Photos (Evidencia Fotográfica)
-- Run this in the Supabase SQL Editor
-- Also create a Storage bucket named "cwp-photos" (Public) in the Supabase UI
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cwp_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cwp_name     TEXT NOT NULL,
  discipline   TEXT,
  url          TEXT NOT NULL,
  storage_path TEXT,
  area         TEXT DEFAULT 'General',
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  description  TEXT,
  uploaded_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by CWP
CREATE INDEX IF NOT EXISTS cwp_photos_cwp_name_idx ON public.cwp_photos(cwp_name);
CREATE INDEX IF NOT EXISTS cwp_photos_date_idx ON public.cwp_photos(date DESC);

-- RLS
ALTER TABLE public.cwp_photos ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view all photos
CREATE POLICY "photos_select" ON public.cwp_photos
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to insert
CREATE POLICY "photos_insert" ON public.cwp_photos
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow users to delete their own photos (or admin can delete any)
CREATE POLICY "photos_delete" ON public.cwp_photos
  FOR DELETE USING (
    auth.uid() = uploaded_by
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
