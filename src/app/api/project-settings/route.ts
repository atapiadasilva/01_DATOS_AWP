import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET ?projectId=xxx  → project settings row (or defaults if not yet configured)
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const { data, error } = await supabase
    .from('project_settings')
    .select('*')
    .eq('project_id', projectId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = row not found
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-create if missing (shouldn't happen after migration, but safe fallback)
  if (!data) {
    const { data: created, error: createErr } = await supabase
      .from('project_settings')
      .insert({ project_id: projectId })
      .select()
      .single();
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
    return NextResponse.json(created);
  }

  return NextResponse.json(data);
}

// PUT { projectId, ...fields }  → upsert project settings
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { projectId, ...rest } = body;
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const allowed = [
    'aps_model_urn', 'aps_model_name',
    'wbs_entity_name',
    'wbs_col_edt', 'wbs_col_name', 'wbs_col_start', 'wbs_col_end',
    'wbs_col_baseline_start', 'wbs_col_baseline_end',
    'wbs_col_progress', 'wbs_col_duration', 'wbs_col_discipline', 'wbs_col_cwp', 'wbs_col_hh',
    'setup_completed', 'setup_step',
  ];

  const payload: Record<string, any> = { project_id: projectId };
  for (const key of allowed) {
    if (key in rest) payload[key] = rest[key];
  }

  const { data, error } = await supabase
    .from('project_settings')
    .upsert(payload, { onConflict: 'project_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
