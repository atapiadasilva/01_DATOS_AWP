import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-server';

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Lazy init — SUPABASE_SERVICE_ROLE_KEY is a server-only env var; creating the
  // client here (instead of at module level) ensures it only runs at request time.
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { client } = auth;

  try {
    const body = await req.json();
    const { action, entityId, viewId, data, recordId } = body;

    // ─── CREATE RECORD ────────────────────────────────────────────────────
    if (action === 'create') {
      if (!entityId || !data) {
        return NextResponse.json({ error: 'Missing entityId or data' }, { status: 400 });
      }

      // RLS on data_records will block if entityId doesn't belong to user's project
      const { data: newRecord, error: masterError } = await client
        .from('data_records')
        .insert({ entity_id: entityId, data })
        .select()
        .single();

      if (masterError) throw masterError;

      // Sync to the materialized view table (admin bypasses its RLS)
      if (viewId) {
        const { data: view } = await supabaseAdmin
          .from('custom_views')
          .select('*')
          .eq('id', viewId)
          .single();

        if (view?.table_name) {
          const row: Record<string, any> = { _record_id: newRecord.id };
          (view.columns || []).forEach((col: string, idx: number) => {
            const matchKey = Object.keys(data).find(
              k => k.trim().toLowerCase() === col.trim().toLowerCase()
            );
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

    // ─── DELETE RECORD ────────────────────────────────────────────────────
    if (action === 'delete') {
      if (!recordId) {
        return NextResponse.json({ error: 'Missing recordId' }, { status: 400 });
      }

      // Sync delete to the materialized view table
      if (viewId) {
        const { data: view } = await supabaseAdmin
          .from('custom_views')
          .select('table_name')
          .eq('id', viewId)
          .single();

        if (view?.table_name) {
          await supabaseAdmin.from(view.table_name).delete().eq('_record_id', recordId);
        }
      }

      // Delete from master table — RLS ensures the record belongs to user's project
      const { error } = await client.from('data_records').delete().eq('id', recordId);
      if (error) throw error;

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    console.error('API Records Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
