export type DataType = 'text' | 'number' | 'date' | 'boolean';

export interface Entity {
  id: string;
  project_id: string;
  name: string;
  file_type: 'xlsx' | 'csv';
  position_x?: number;
  position_y?: number;
  created_at: string;
}

export interface Attribute {
  id: string;
  entity_id: string;
  name: string;
  data_type: DataType;
  is_pk: boolean;
  created_at?: string;
}

export interface DataRecord {
  id: string;
  entity_id: string;
  pk_value?: string | null;
  data: Record<string, any>;
  created_at: string;
}

export interface Relationship {
  id: string;
  project_id: string;
  parent_attribute_id: string;
  child_attribute_id: string;
  cardinality?: '1:1' | '1:N' | 'N:1';
  join_type?: 'inner' | 'left';
  created_at?: string;
}

// ── Enriched types (result of Supabase relational joins) ──────────────────

/** Entity row including its nested attributes array (from `select('*, attributes(*)')`) */
export interface EntityWithAttributes extends Entity {
  attributes: Attribute[];
}

/** Attribute with its parent entity nested (from `attributes!fk(*, entity:entities(*))`) */
export interface AttributeWithEntity extends Attribute {
  entity: Entity;
}

/** Relationship with both sides fully resolved */
export interface RelationshipWithAttrs extends Relationship {
  parent_attr: AttributeWithEntity;
  child_attr:  AttributeWithEntity;
}

/** custom_views row as stored in Supabase */
export interface CustomView {
  id: string;
  name: string;
  entity_id: string;
  columns: string[];
  filter_key: string | null;
  project_id: string | null;
  table_name: string | null;
  is_global: boolean;
  entity_name: string | null;
  created_at: string;
}
