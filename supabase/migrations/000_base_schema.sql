-- ═══════════════════════════════════════════════════════════════════════════
-- datapower4D — Base Schema
-- Run this FIRST, before all other migrations.
-- Creates the core domain tables that every other migration depends on.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── entities ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.entities (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  file_type   TEXT        CHECK (file_type IN ('xlsx', 'csv')),
  position_x  FLOAT,
  position_y  FLOAT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── attributes ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attributes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id  UUID        NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  data_type  TEXT        NOT NULL DEFAULT 'text'
             CHECK (data_type IN ('text', 'number', 'date', 'boolean')),
  is_pk      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entity_id, name)
);

-- ── data_records ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.data_records (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id  UUID        NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  pk_value   TEXT,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entity_id, pk_value)
);

-- ── relationships ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.relationships (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_attribute_id  UUID        REFERENCES public.attributes(id) ON DELETE CASCADE,
  child_attribute_id   UUID        REFERENCES public.attributes(id) ON DELETE CASCADE,
  cardinality          TEXT        CHECK (cardinality IN ('1:1', '1:N', 'N:1')),
  join_type            TEXT        DEFAULT 'left' CHECK (join_type IN ('inner', 'left')),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── custom_views ──────────────────────────────────────────────────────────
-- Note: the /api/views route also creates this table via exec_sql on `init`,
-- so CREATE TABLE IF NOT EXISTS is intentional here.
CREATE TABLE IF NOT EXISTS public.custom_views (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  entity_id  UUID        REFERENCES public.entities(id) ON DELETE CASCADE,
  columns    JSONB       NOT NULL DEFAULT '[]',
  filter_key TEXT,
  table_name TEXT        UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
