import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET  ?projectId=&modelUrn=   → { activityId: string[] }[]
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  const modelUrn  = req.nextUrl.searchParams.get('modelUrn');
  let q = supabase.from('weekly_plan_links').select('activity_id, external_id').limit(5000);
  if (projectId) q = q.eq('project_id', projectId);
  if (modelUrn)  q = q.eq('model_urn',  modelUrn);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Group by activity_id
  const map: Record<string, string[]> = {};
  for (const r of (data ?? [])) {
    (map[r.activity_id] ??= []).push(r.external_id);
  }
  return NextResponse.json(map);
}

// POST { activityId, projectId, modelUrn, externalIds[] }
// Chunks inserts into batches of 50 to avoid PostgREST row limits
export async function POST(req: NextRequest) {
  const { activityId, projectId, modelUrn, externalIds } = await req.json();
  if (!activityId || !externalIds?.length)
    return NextResponse.json({ error: 'activityId and externalIds required' }, { status: 400 });

  const rows = (externalIds as string[]).map(extId => ({
    activity_id: activityId,
    project_id:  projectId,
    model_urn:   modelUrn,
    external_id: extId,
  }));

  // Chunk into batches of 50 to safely handle large element sets (100+)
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('weekly_plan_links')
      .upsert(batch, { onConflict: 'activity_id,model_urn,external_id' });
    if (error) return NextResponse.json({ error: error.message, batch: i }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: rows.length });
}

// DELETE { activityId }                        → removes ALL links for that activity
// DELETE { activityId, externalIds: string[] } → removes ONLY those specific elements
export async function DELETE(req: NextRequest) {
  const { activityId, externalIds } = await req.json();
  if (!activityId) return NextResponse.json({ error: 'activityId required' }, { status: 400 });

  let q = supabase.from('weekly_plan_links').delete().eq('activity_id', activityId);
  if (externalIds?.length) {
    q = q.in('external_id', externalIds);
  }
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
