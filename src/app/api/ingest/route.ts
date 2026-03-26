import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { processETL } from '@/lib/ingestion-utils';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const { 
      projectId, 
      entityName, 
      fileType, 
      rows, 
      pkColumns, 
      cleaningRules,
      strategy, // 'replace' | 'upsert' | 'chunk'
      columnTypes,
      entityId: bodyEntityId
    } = await req.json();

    if (!projectId || !entityName || !rows) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Create or reference Entity
    let entityId = bodyEntityId; // Usar el del body si existe
    
    if (strategy !== 'chunk') {
      let { data: entity, error: entityError } = await supabase
        .from('entities')
        .select('id')
        .eq('project_id', projectId)
        .eq('name', entityName)
        .single();
  
      if (!entity) {
        const { data: newEntity, error: createError } = await supabase
          .from('entities')
          .insert({
            project_id: projectId,
            name: entityName,
            file_type: fileType
          })
          .select()
          .single();
        
        if (createError || !newEntity) throw createError || new Error('Failed to create entity');
        entityId = newEntity.id;
      } else {
        entityId = entity.id;
      }
  
      // 3. Handle Strategy (Solo en el primer chunk o si no es chunk)
      if (strategy === 'replace') {
        const { error: deleteError } = await supabase
          .from('data_records')
          .delete()
          .eq('entity_id', entityId);
        
        if (deleteError) throw deleteError;
      }
    } else {
      // Si es chunk, el entityId DEBE venir en el request o lo buscamos por nombre
      if (!entityId) {
        const { data: entity } = await supabase.from('entities').select('id').eq('project_id', projectId).eq('name', entityName).single();
        if (entity) entityId = entity.id;
        else throw new Error('Entity not found for chunk strategy');
      }
    }

    // 2. Process Data (ETL)
    const processedRows = processETL(rows, pkColumns, cleaningRules, columnTypes);

    // 4. Batch Insert/Upsert
    const records = processedRows.map((row: any) => ({
      entity_id: entityId,
      pk_value: row.__pk || null,
      data: row
    }));

    const { error: insertError } = await supabase
      .from('data_records')
      .upsert(records, { onConflict: 'entity_id, pk_value' });

    if (insertError) throw insertError;

    // 5. Update Attributes (Metadata)
    const attributes = Object.keys(rows[0]).map(col => ({
      entity_id: entityId,
      name: col,
      data_type: columnTypes[col] || 'text',
      is_pk: pkColumns.includes(col)
    }));

    await supabase
      .from('attributes')
      .upsert(attributes, { onConflict: 'entity_id, name' });

    return NextResponse.json({ success: true, entityId });
  } catch (err: any) {
    console.error('Ingestion Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
