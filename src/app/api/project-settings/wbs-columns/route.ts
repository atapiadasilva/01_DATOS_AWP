import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET ?projectId=xxx&entityName=xxx
 * Returns { columns: string[], preview: object[] } from the first few
 * data_records of the given entity so the wizard can show a live preview
 * and auto-detect column mappings.
 */
export async function GET(req: NextRequest) {
  const projectId  = req.nextUrl.searchParams.get('projectId');
  const entityName = req.nextUrl.searchParams.get('entityName') ?? 'PROGRAMA DE OBRA ACTUALIZADO';

  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  // 1. Find the entity
  let entQ = supabase.from('entities').select('id').eq('name', entityName);
  const { data: ents } = await entQ;

  const ent = ents?.find((e: any) => e.project_id === projectId) ?? ents?.[0];
  if (!ent) return NextResponse.json({ columns: [], preview: [] });

  // 2. Load attributes (column names)
  const { data: attrs } = await supabase
    .from('attributes')
    .select('name')
    .eq('entity_id', ent.id)
    .order('name');

  const columns: string[] = (attrs ?? []).map((a: any) => a.name);

  // 3. Load 3 preview rows
  const { data: records } = await supabase
    .from('data_records')
    .select('data')
    .eq('entity_id', ent.id)
    .limit(3);

  const preview = (records ?? []).map((r: any) => r.data);

  // 4. If no attributes yet, derive columns from first record keys
  if (columns.length === 0 && preview.length > 0) {
    columns.push(...Object.keys(preview[0]));
  }

  return NextResponse.json({ columns, preview });
}
