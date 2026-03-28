import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const p         = req.nextUrl.searchParams;
  const projectId = p.get('projectId');
  const modelUrn  = p.get('modelUrn');
  if (!projectId || !modelUrn)
    return NextResponse.json({ error: 'projectId and modelUrn required' }, { status: 400 });

  const { data, error } = await supabase
    .from('aps_wbs_links')
    .select('external_id, wbs_id, task_name')
    .eq('project_id', projectId)
    .eq('model_urn',  modelUrn);

  if (error) {
    console.error('[API/WBS-LINKS] GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { projectId, modelUrn, wbsId, taskName, externalIds } = await req.json();
  if (!projectId || !modelUrn || !wbsId || !externalIds?.length)
    return NextResponse.json({ error: 'Faltan campos' }, { status: 400 });

  const rows = (externalIds as string[]).map(id => ({
    project_id:  projectId,
    model_urn:   modelUrn,
    external_id: id,
    wbs_id:      wbsId,
    task_name:   taskName ?? null,
    linked_at:   new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('aps_wbs_links')
    .upsert(rows, { onConflict: 'project_id,model_urn,external_id' });

  if (error) {
    console.error('[API/WBS-LINKS] POST Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ linked: rows.length });
}

export async function DELETE(req: NextRequest) {
  const { projectId, modelUrn, externalIds } = await req.json();
  if (!projectId || !modelUrn || !externalIds?.length)
    return NextResponse.json({ error: 'Faltan campos' }, { status: 400 });

  const { error } = await supabase
    .from('aps_wbs_links')
    .delete()
    .eq('project_id', projectId)
    .eq('model_urn',  modelUrn)
    .in('external_id', externalIds);

  if (error) {
    console.error('[API/WBS-LINKS] DELETE Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ removed: externalIds.length });
}
