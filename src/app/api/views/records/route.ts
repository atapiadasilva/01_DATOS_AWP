import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, entityId, viewId, data, recordId } = body;

    // ─── ACCIÓN: CREATE RECORD ──────────────────────────────────────────────
    if (action === 'create') {
      if (!entityId || !data) return NextResponse.json({ error: 'Missing entityId or data' }, { status: 400 });

      // 1. Insertar en data_records (La tabla maestra)
      const { data: newRecord, error: masterError } = await supabaseAdmin
        .from('data_records')
        .insert({
          entity_id: entityId,
          data: data
        })
        .select()
        .single();

      if (masterError) throw masterError;

      // 2. Sincronizar con la vista materializada si existe
      if (viewId) {
        const { data: view } = await supabaseAdmin
          .from('custom_views')
          .select('*')
          .eq('id', viewId)
          .single();

        if (view && view.table_name) {
          const row: Record<string, any> = { _record_id: newRecord.id };
          (view.columns || []).forEach((col: string, idx: number) => {
            // Buscar la llave en el JSON ignorando espacios/case
            const matchKey = Object.keys(data).find(k => k.trim().toLowerCase() === col.trim().toLowerCase());
            row[`col_${idx}`] = matchKey ? data[matchKey] : null;
          });

          const { error: syncError } = await supabaseAdmin
            .from(view.table_name)
            .insert(row);
          
          if (syncError) console.error('Error syncing to materialized table:', syncError);
        }
      }

      return NextResponse.json({ ok: true, record: newRecord });
    }

    // ─── ACCIÓN: DELETE RECORD ──────────────────────────────────────────────
    if (action === 'delete') {
      if (!recordId) return NextResponse.json({ error: 'Missing recordId' }, { status: 400 });

      // 1. Opcional: Borrar de la vista materializada si se provee viewId
      if (viewId) {
        const { data: view } = await supabaseAdmin
          .from('custom_views')
          .select('table_name')
          .eq('id', viewId)
          .single();
        
        if (view && view.table_name) {
          await supabaseAdmin.from(view.table_name).delete().eq('_record_id', recordId);
        }
      }

      // 2. Borrar de la tabla maestra (Cascada manual)
      const { error } = await supabaseAdmin.from('data_records').delete().eq('id', recordId);
      if (error) throw error;

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    console.error('API Records Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
