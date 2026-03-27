import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-server';
import { processETL } from '@/lib/ingestion-utils';

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { client } = auth;

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
    // Using the user-scoped client: RLS on entities ensures projectId belongs to this user
    let entityId = bodyEntityId;

    if (strategy !== 'chunk') {
      const { data: entity } = await client
        .from('entities')
        .select('id')
        .eq('project_id', projectId)
        .eq('name', entityName)
        .single();

      if (!entity) {
        const { data: newEntity, error: createError } = await client
          .from('entities')
          .insert({ project_id: projectId, name: entityName, file_type: fileType })
          .select()
          .single();

        if (createError || !newEntity) throw createError || new Error('Failed to create entity');
        entityId = newEntity.id;
      } else {
        entityId = entity.id;
      }

      if (strategy === 'replace') {
        const { error: deleteError } = await client
          .from('data_records')
          .delete()
          .eq('entity_id', entityId);

        if (deleteError) throw deleteError;
      }
    } else {
      if (!entityId) {
        const { data: entity } = await client
          .from('entities')
          .select('id')
          .eq('project_id', projectId)
          .eq('name', entityName)
          .single();
        if (entity) entityId = entity.id;
        else throw new Error('Entity not found for chunk strategy');
      }
    }

    // 2. Process Data (ETL)
    const processedRows = processETL(rows, pkColumns, cleaningRules, columnTypes);

    // 3. Batch Upsert
    const records = processedRows.map((row: any) => ({
      entity_id: entityId,
      pk_value: row.__pk || null,
      data: row
    }));

    const { error: insertError } = await client
      .from('data_records')
      .upsert(records, { onConflict: 'entity_id, pk_value' });

    if (insertError) throw insertError;

    // 4. Update Attributes (Metadata)
    const attributes = Object.keys(rows[0]).map((col: string) => ({
      entity_id: entityId,
      name: col,
      data_type: columnTypes?.[col] || 'text',
      is_pk: (pkColumns || []).includes(col)
    }));

    await client
      .from('attributes')
      .upsert(attributes, { onConflict: 'entity_id, name' });

    return NextResponse.json({ success: true, entityId });
  } catch (err: any) {
    console.error('Ingestion Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
