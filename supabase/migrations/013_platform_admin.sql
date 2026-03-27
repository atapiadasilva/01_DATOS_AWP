-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — Platform Admin Migration
-- Adds:
--   • is_platform_admin flag on user_profiles
--   • status (active/inactive) on user_profiles
--   • status (active/archived) on projects
--   • RLS updates so platform admin bypasses project ownership checks
--   • RPC get_platform_users() — returns all users with emails (admin only)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Schema changes ─────────────────────────────────────────────────────────

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'inactive'));

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'archived'));

-- ── 2. Helper: is current user the platform admin? ─────────────────────────────

CREATE OR REPLACE FUNCTION public.current_user_is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM public.user_profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

-- ── 3. user_profiles RLS — platform admin can update any profile ──────────────

DROP POLICY IF EXISTS "profiles_update_platform_admin" ON public.user_profiles;
CREATE POLICY "profiles_update_platform_admin" ON public.user_profiles
  FOR UPDATE USING (public.current_user_is_platform_admin());

-- ── 4. projects RLS — platform admin sees and manages all ─────────────────────

DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (
      user_id = auth.uid()
      OR public.current_user_is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = id AND pm.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "projects_insert" ON public.projects;
CREATE POLICY "projects_insert" ON public.projects
  FOR INSERT WITH CHECK (
    auth.uid() = user_id OR public.current_user_is_platform_admin()
  );

DROP POLICY IF EXISTS "projects_update" ON public.projects;
CREATE POLICY "projects_update" ON public.projects
  FOR UPDATE USING (
    user_id = auth.uid() OR public.current_user_is_platform_admin()
  );

DROP POLICY IF EXISTS "projects_delete" ON public.projects;
CREATE POLICY "projects_delete" ON public.projects
  FOR DELETE USING (
    user_id = auth.uid() OR public.current_user_is_platform_admin()
  );

-- ── 5. project_members RLS ─────────────────────────────────────────────────────

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_select" ON public.project_members;
CREATE POLICY "members_select" ON public.project_members
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "members_insert" ON public.project_members;
CREATE POLICY "members_insert" ON public.project_members
  FOR INSERT WITH CHECK (
    public.current_user_is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = project_id AND pm.user_id = auth.uid() AND pm.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "members_update" ON public.project_members;
CREATE POLICY "members_update" ON public.project_members
  FOR UPDATE USING (
    public.current_user_is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = project_id AND pm.user_id = auth.uid() AND pm.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "members_delete" ON public.project_members;
CREATE POLICY "members_delete" ON public.project_members
  FOR DELETE USING (
    public.current_user_is_platform_admin()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = project_id AND pm.user_id = auth.uid() AND pm.role = 'admin'
    )
  );

-- ── 6. RPC: get all platform users with email (platform admin only) ────────────

CREATE OR REPLACE FUNCTION public.get_platform_users()
RETURNS TABLE (
  id                UUID,
  email             TEXT,
  full_name         TEXT,
  role              TEXT,
  is_platform_admin BOOLEAN,
  status            TEXT,
  created_at        TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    up.id,
    au.email,
    up.full_name,
    up.role,
    up.is_platform_admin,
    up.status,
    up.created_at
  FROM public.user_profiles up
  JOIN auth.users au ON au.id = up.id
  WHERE public.current_user_is_platform_admin() = TRUE
  ORDER BY up.created_at;
$$;

-- ── 7. RPC: get members of a project with user info ───────────────────────────

CREATE OR REPLACE FUNCTION public.get_project_members(p_project_id UUID)
RETURNS TABLE (
  user_id   UUID,
  email     TEXT,
  full_name TEXT,
  role      TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    pm.user_id,
    au.email,
    up.full_name,
    pm.role,
    pm.joined_at
  FROM public.project_members pm
  JOIN auth.users au ON au.id = pm.user_id
  JOIN public.user_profiles up ON up.id = pm.user_id
  WHERE pm.project_id = p_project_id
    AND (
      public.current_user_is_platform_admin()
      OR pm.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.projects p WHERE p.id = p_project_id AND p.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.project_members me
        WHERE me.project_id = p_project_id AND me.user_id = auth.uid()
      )
    )
  ORDER BY pm.joined_at;
$$;

-- ── 8. Promote the first existing admin to platform admin ─────────────────────
-- Run this ONCE to bootstrap your own platform_admin flag.
-- Edit the email below to match your account, then uncomment and execute.

/*
UPDATE public.user_profiles
SET is_platform_admin = TRUE
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'tu@email.com' LIMIT 1
);
*/
