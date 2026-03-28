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
  let q = supabase.from('weekly_plan_links').select('activity_id, external_id');
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
export async function POST(req: NextRequest) {
  const { activityId, projectId, modelUrn, externalIds } = await req.json();
  if (!activityId || !externalIds?.length)
    return NextResponse.json({ error: 'activityId and externalIds required' }, { status: 400 });
  const rows = externalIds.map((extId: string) => ({
    activity_id: activityId,
    project_id:  projectId,
    model_urn:   modelUrn,
    external_id: extId,
  }));
  const { error } = await supabase
    .from('weekly_plan_links')
    .upsert(rows, { onConflict: 'activity_id,model_urn,external_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: rows.length });
}

// DELETE { activityId }   → removes all links for that activity
export async function DELETE(req: NextRequest) {
  const { activityId } = await req.json();
  const { error } = await supabase
    .from('weekly_plan_links')
    .delete()
    .eq('activity_id', activityId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
