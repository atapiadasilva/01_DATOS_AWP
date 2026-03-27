-- Tabla para mapeos de Fuente de Verdad (SOT)
CREATE TABLE IF NOT EXISTS sot_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    master_key TEXT NOT NULL, -- e.g., 'discipline', 'area', 'wbs'
    source_entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    source_attribute_id UUID REFERENCES attributes(id) ON DELETE CASCADE,
    mapping_type TEXT DEFAULT 'direct', -- 'direct' o 'lookup'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, master_key)
);

-- Habilitar RLS
ALTER TABLE sot_mappings ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Lectura global para usuarios autenticados"
ON sot_mappings FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Escritura para administradores"
ON sot_mappings FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Comentarios
COMMENT ON TABLE sot_mappings IS 'Almacena la configuración de la fuente de verdad (SOT) para parámetros globales por proyecto.';
