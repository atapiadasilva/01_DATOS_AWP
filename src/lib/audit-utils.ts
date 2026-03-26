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
  // 1. Get relationship details
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

  const parentId = rel.parent_attr.entity.id;
  const childId = rel.child_attr.entity.id;
  const parentCol = rel.parent_attr.name;
  const childCol = rel.child_attr.name;

  // 2. Perform Join via JavaScript in-memory (Avoiding RPC 406 error)
  try {
    const [parentRes, childRes] = await Promise.all([
      supabase.from('data_records').select('data').eq('entity_id', parentId),
      supabase.from('data_records').select('data').eq('entity_id', childId)
    ]);

    if (parentRes.error || childRes.error) {
      console.error('Fetch Error:', parentRes.error || childRes.error);
      return null;
    }

    const parents = parentRes.data || [];
    const children = childRes.data || [];

    const parentValues = new Set(parents.map(r => String(r.data?.[parentCol] || '').trim().toLowerCase()));
    
    let matchedCount = 0;
    let orphanCount = 0;

    children.forEach(record => {
      const val = String(record.data?.[childCol] || '').trim().toLowerCase();
      if (val && parentValues.has(val)) {
        matchedCount++;
      } else {
        orphanCount++;
      }
    });

    return {
      parentEntityName: rel.parent_attr.entity.name,
      childEntityName: rel.child_attr.entity.name,
      parentAttribute: parentCol,
      childAttribute: childCol,
      totalChildRecords: children.length,
      matchedRecords: matchedCount,
      orphanRecords: orphanCount,
      matchPercentage: children.length > 0 ? (matchedCount / children.length) * 100 : 100
    };
  } catch (err) {
    console.error('Audit execution error:', err);
    return null;
  }
};
