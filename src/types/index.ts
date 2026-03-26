export type DataType = 'text' | 'number' | 'date' | 'boolean';

export interface Entity {
  id: string;
  project_id: string;
  name: string;
  file_type: 'xlsx' | 'csv';
  created_at: string;
}

export interface Attribute {
  id: string;
  entity_id: string;
  name: string;
  data_type: DataType;
  is_pk: boolean;
}

export interface DataRecord {
  id: string;
  entity_id: string;
  data: Record<string, any>;
  created_at: string;
}

export interface Relationship {
  id: string;
  project_id: string;
  parent_attribute_id: string;
  child_attribute_id: string;
  cardinality: '1:1' | '1:N' | 'N:1';
  join_type: 'inner' | 'left';
}
