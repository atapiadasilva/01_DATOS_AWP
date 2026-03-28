import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/aps/elements?projectId=...&modelUrn=...
// Returns all element-CWP assignments for a model
export async function GET(req: NextRequest) {
  const p         = req.nextUrl.searchParams;
  const projectId = p.get('projectId');
  const modelUrn  = p.get('modelUrn');
  if (!projectId || !modelUrn) {
    return NextResponse.json({ error: 'projectId and modelUrn required' }, { status: 400 });
  }
  const { data, error } = await supabase
    .from('aps_element_links')
    .select('external_id, element_name, category, cwp_code, discipline, linked_at')
    .eq('project_id', projectId)
    .eq('model_urn',  modelUrn);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/aps/elements
// Body: { projectId, modelUrn, userId, cwpCode, elements: [{externalId, name, category}] }
// Upserts assignments (one element can change CWP)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { projectId, modelUrn, userId, cwpCode, elements } = body;
  if (!projectId || !modelUrn || !cwpCode || !elements?.length) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  }

  const rows = (elements as { externalId: string; name?: string; category?: string }[]).map(el => ({
    project_id:  projectId,
    model_urn:   modelUrn,
    external_id: el.externalId,
    element_name: el.name    ?? null,
    category:     el.category ?? null,
    cwp_code:    cwpCode,
    linked_by:   userId ?? null,
    linked_at:   new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('aps_element_links')
    .upsert(rows, { onConflict: 'project_id,model_urn,external_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assigned: rows.length });
}

// DELETE /api/aps/elements
// Body: { projectId, modelUrn, externalIds: string[] }
export async function DELETE(req: NextRequest) {
  const { projectId, modelUrn, externalIds } = await req.json();
  if (!projectId || !modelUrn || !externalIds?.length) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  }
  const { error } = await supabase
    .from('aps_element_links')
    .delete()
    .eq('project_id', projectId)
    .eq('model_urn',  modelUrn)
    .in('external_id', externalIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ removed: externalIds.length });
}
