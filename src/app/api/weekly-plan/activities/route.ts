import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  let q = supabase.from('weekly_plan_activities').select('*').order('sort_order', { ascending: true }).order('start_date');
  q = q.eq('project_id', projectId);
  
  const { data, error } = await q;
  if (error) {
    // If sort_order doesn't exist yet, fallback to start_date
    if (error.code === '42703') {
      let fq = supabase.from('weekly_plan_activities').select('*').order('start_date').eq('project_id', projectId);
      const fb = await fq;
      if (fb.error) return NextResponse.json({ error: fb.error.message }, { status: 500 });
      return NextResponse.json(fb.data ?? []);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const payload: any = {
    project_id: body.projectId,
    title:      body.title,
    discipline: body.discipline ?? '',
    start_date: body.startDate,
    end_date:   body.endDate,
    progress:   body.progress ?? 0,
    wbs_edt:    body.wbsEdt   ?? '',
    wbs_name:   body.wbsName  ?? '',
    notes:      body.notes    ?? '',
    color:      body.color    ?? '',
  };
  if ('sortOrder' in body) payload.sort_order = body.sortOrder ?? 0;

  let res = await supabase.from('weekly_plan_activities').insert(payload).select().single();
  
  // Fallback para si no han corrido la migración de sort_order
  if (res.error && res.error.code === '42703' && payload.sort_order !== undefined) {
    delete payload.sort_order;
    res = await supabase.from('weekly_plan_activities').insert(payload).select().single();
  }

  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  return NextResponse.json(res.data);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const payload: any = {
    title:      body.title,
    discipline: body.discipline ?? '',
    start_date: body.startDate,
    end_date:   body.endDate,
    progress:   body.progress ?? 0,
    wbs_edt:    body.wbsEdt   ?? '',
    wbs_name:   body.wbsName  ?? '',
    notes:      body.notes    ?? '',
    color:      body.color    ?? '',
    updated_at: new Date().toISOString(),
  };
  if ('sortOrder' in body) payload.sort_order = body.sortOrder;

  let res = await supabase.from('weekly_plan_activities').update(payload).eq('id', body.id).select().single();
  
  if (res.error && res.error.code === '42703' && payload.sort_order !== undefined) {
    delete payload.sort_order;
    res = await supabase.from('weekly_plan_activities').update(payload).eq('id', body.id).select().single();
  }

  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  return NextResponse.json(res.data);
}

// Patch updates (single or batch)
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  
  // 1. Array Case (Batch Sort Order)
  if (Array.isArray(body)) {
    const promises = body.map((u: any) => 
      supabase.from('weekly_plan_activities').update({ sort_order: u.sort_order }).eq('id', u.id)
    );
    const results = await Promise.all(promises);
    const errs = results.filter(r => r.error);
    if (errs.length > 0 && errs[0].error?.code !== '42703') {
      return NextResponse.json({ error: errs[0].error?.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  // 2. Object Case (Single field update)
  if (!body.id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
  const { id, ...rest } = body;
  
  // Map camelCase to snake_case if necessary
  const payload: any = {};
  if ('title' in rest)      payload.title      = rest.title;
  if ('discipline' in rest) payload.discipline = rest.discipline;
  if ('startDate' in rest)  payload.start_date = rest.startDate;
  if ('endDate' in rest)    payload.end_date   = rest.endDate;
  if ('start_date' in rest) payload.start_date = rest.start_date;
  if ('end_date' in rest)   payload.end_date   = rest.end_date;
  if ('progress' in rest)   payload.progress   = rest.progress;
  if ('color' in rest)      payload.color      = rest.color;
  if ('notes' in rest)      payload.notes      = rest.notes;
  if ('sort_order' in rest) payload.sort_order = rest.sort_order;

  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('weekly_plan_activities')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '42703' && 'sort_order' in payload) {
       delete payload.sort_order;
       const retry = await supabase.from('weekly_plan_activities').update(payload).eq('id', id).select().single();
       if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 });
       return NextResponse.json(retry.data);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const { error } = await supabase
    .from('weekly_plan_activities')
    .delete()
    .eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
