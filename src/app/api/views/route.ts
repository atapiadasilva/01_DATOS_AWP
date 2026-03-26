import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Usar service_role para poder ejecutar DDL en Supabase
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    // ─── INIT: Crear tabla custom_views si no existe ──────────────────────────
    if (action === 'init') {
      const { error } = await supabaseAdmin.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS custom_views (
            id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name        text NOT NULL,
            entity_id   uuid REFERENCES entities(id) ON DELETE CASCADE,
            columns     jsonb NOT NULL DEFAULT '[]',
            filter_key  text,
            project_id  uuid,
            table_name  text UNIQUE,
            created_at  timestamptz DEFAULT now()
          );
          GRANT SELECT, INSERT, UPDATE, DELETE ON custom_views TO anon, authenticated, postgres, service_role;
        `
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // ─── CREATE/UPDATE VIEW: Guardar metadata + crear tabla materializada ────────────
    if (action === 'create' || action === 'update') {
      const { name, entity_id, columns, filter_key, id } = body;

      let viewId = id;
      let tableName = body.table_name;

      // 1. Si es creación, generar nombre de tabla
      if (action === 'create') {
        tableName = `view_${name
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '')
          .slice(0, 40)}_${Date.now().toString(36)}`;

        const { data, error } = await supabaseAdmin.from('custom_views').insert({
          name, entity_id, columns, filter_key: filter_key || null, table_name: tableName
        }).select().single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        viewId = data.id;
      } else {
        // Si es update, obtener el table_name actual para poder dropearla
        const { data: existing } = await supabaseAdmin.from('custom_views').select('table_name').eq('id', id).single();
        tableName = existing?.table_name || tableName;

        const { error } = await supabaseAdmin.from('custom_views').update({
          name, entity_id, columns, filter_key: filter_key || null
        }).eq('id', id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // 2. Obtener todos los data_records de la entidad (con paginación)
      let allRecords: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabaseAdmin
          .from('data_records')
          .select('id, data')
          .eq('entity_id', entity_id)
          .range(from, from + PAGE - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        allRecords = allRecords.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      // 3. (RE)CREAR Tabla Física
      if (tableName) {
        // Borrar si ya existe (para refrescar columnas)
        try { await supabaseAdmin.rpc('exec_sql', { sql: `DROP TABLE IF EXISTS "${tableName}";` }); } catch (_) {}

        if (allRecords.length > 0) {
          const colDefs = (columns as string[]).map((c, idx) => `col_${idx} text`).join(', ');
          const createSQL = `
            CREATE TABLE IF NOT EXISTS "${tableName}" (
              _record_id uuid PRIMARY KEY,
              ${colDefs}
            );
            GRANT SELECT ON "${tableName}" TO anon, authenticated, postgres, service_role;
          `;
          try { await supabaseAdmin.rpc('exec_sql', { sql: createSQL }); } catch (_) {}

          // 4. Insertar datos proyectados en lotes de 500
          const BATCH = 500;
          for (let i = 0; i < allRecords.length; i += BATCH) {
            const batch = allRecords.slice(i, i + BATCH).map((r: any) => {
              const row: Record<string, any> = { _record_id: r.id };
              (columns as string[]).forEach((col, idx) => { row[`col_${idx}`] = r.data?.[col] ?? null; });
              return row;
            });
            try { await supabaseAdmin.from(tableName).insert(batch); } catch (_) {}
          }
        }
      }

      return NextResponse.json({ ok: true, viewId, tableName });
    }

    // ─── DELETE VIEW: Eliminar metadata y tabla ───────────────────────────────
    if (action === 'delete') {
      const { id } = body;
      const { data: view } = await supabaseAdmin.from('custom_views').select('table_name').eq('id', id).single();
      if (view?.table_name) {
        try { await supabaseAdmin.rpc('exec_sql', { sql: `DROP TABLE IF EXISTS "${view.table_name}";` }); } catch (_) {}
      }
      await supabaseAdmin.from('custom_views').delete().eq('id', id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
