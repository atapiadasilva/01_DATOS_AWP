-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — SaaS Multi-tenant Schema Migration
-- Run this in the Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. User profiles (extends auth.users) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role      TEXT NOT NULL DEFAULT 'viewer'
             CHECK (role IN ('admin', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'invited_role', 'viewer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 2. Projects ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  owner_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. Project members (for future per-project role assignments) ──────────
CREATE TABLE IF NOT EXISTS public.project_members (
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'viewer'
              CHECK (role IN ('admin', 'editor', 'viewer')),
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

-- ── 4. Add project_id to existing tables ─────────────────────────────────
ALTER TABLE public.entities
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.custom_views
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.relationships
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

-- ── 5. Indexes ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_entities_project     ON public.entities(project_id);
CREATE INDEX IF NOT EXISTS idx_custom_views_project ON public.custom_views(project_id);
CREATE INDEX IF NOT EXISTS idx_relationships_project ON public.relationships(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON public.project_members(user_id);

-- ── 6. RLS Policies ───────────────────────────────────────────────────────

-- user_profiles: users can read all profiles, edit only their own
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON public.user_profiles;
CREATE POLICY "profiles_select" ON public.user_profiles
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "profiles_insert" ON public.user_profiles;
CREATE POLICY "profiles_insert" ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.user_profiles;
CREATE POLICY "profiles_update_own" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Allow admins to update any profile role (via service_role or admin user)
DROP POLICY IF EXISTS "profiles_update_admin" ON public.user_profiles;
CREATE POLICY "profiles_update_admin" ON public.user_profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  );

-- projects: authenticated users can read, owners can write
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (
      owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = id AND pm.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "projects_insert" ON public.projects;
CREATE POLICY "projects_insert" ON public.projects
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "projects_update" ON public.projects;
CREATE POLICY "projects_update" ON public.projects
  FOR UPDATE USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "projects_delete" ON public.projects;
CREATE POLICY "projects_delete" ON public.projects
  FOR DELETE USING (owner_id = auth.uid());

-- ── 7. Migrate existing data to a default project ─────────────────────────
-- (Run this once to assign existing records to a "Legacy Project")
-- Uncomment and run manually after creating your first admin user:

/*
DO $$
DECLARE
  v_owner_id UUID;
  v_project_id UUID;
BEGIN
  -- Get first admin user as owner
  SELECT id INTO v_owner_id FROM public.user_profiles WHERE role = 'admin' LIMIT 1;

  IF v_owner_id IS NOT NULL THEN
    -- Create legacy project
    INSERT INTO public.projects (name, description, owner_id)
    VALUES ('Proyecto AWP — Legado', 'Datos importados antes de la migración multi-proyecto', v_owner_id)
    RETURNING id INTO v_project_id;

    -- Assign all orphan entities to legacy project
    UPDATE public.entities     SET project_id = v_project_id WHERE project_id IS NULL;
    UPDATE public.custom_views SET project_id = v_project_id WHERE project_id IS NULL;
    UPDATE public.relationships SET project_id = v_project_id WHERE project_id IS NULL;
  END IF;
END $$;
*/
