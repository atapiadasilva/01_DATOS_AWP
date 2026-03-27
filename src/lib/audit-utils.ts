import { supabase } from './supabase';

export interface IntegrityAudit {
  parentEntityName: string;
  childEntityName: string;
  parentAttribute: string;
  childAttribute: string;
  totalChildRecords: number;
  matchedRecords: number;
  orphanRecords: number;
  matchPercentage: number;
}

export const runIntegrityAudit = async (
  relationshipId: string
): Promise<IntegrityAudit | null> => {
  // 1. Get relationship metadata
  const { data: rel, error: relError } = await supabase
    .from('relationships')
    .select(`
      *,
      parent_attr:attributes!parent_attribute_id(name, entity:entities(id, name)),
      child_attr:attributes!child_attribute_id(name, entity:entities(id, name))
    `)
    .eq('id', relationshipId)
    .single();

  if (relError || !rel) return null;

  const parentId  = rel.parent_attr.entity.id;
  const childId   = rel.child_attr.entity.id;
  const parentCol = rel.parent_attr.name;
  const childCol  = rel.child_attr.name;

  // 2. Single SQL join via RPC — replaces O(n) in-memory join
  const { data, error } = await supabase.rpc('run_integrity_audit', {
    p_parent_entity_id: parentId,
    p_child_entity_id:  childId,
    p_parent_col:       parentCol,
    p_child_col:        childCol,
  });

  if (error || !data?.[0]) {
    console.error('Audit RPC error:', error);
    return null;
  }

  const { total_child, matched, orphans } = data[0];

  return {
    parentEntityName:  rel.parent_attr.entity.name,
    childEntityName:   rel.child_attr.entity.name,
    parentAttribute:   parentCol,
    childAttribute:    childCol,
    totalChildRecords: Number(total_child),
    matchedRecords:    Number(matched),
    orphanRecords:     Number(orphans),
    matchPercentage:   total_child > 0 ? (Number(matched) / Number(total_child)) * 100 : 100,
  };
};
