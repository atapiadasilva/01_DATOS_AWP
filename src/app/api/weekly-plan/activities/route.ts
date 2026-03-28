import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  let q = supabase.from('weekly_plan_activities').select('*').order('sort_order', { ascending: true }).order('start_date');
  if (projectId) q = q.eq('project_id', projectId);
  
  const { data, error } = await q;
  if (error) {
    // If sort_order doesn't exist yet, fallback to start_date
    if (error.code === '42703') {
      let fq = supabase.from('weekly_plan_activities').select('*').order('start_date');
      if (projectId) fq = fq.eq('project_id', projectId);
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

// Batch update sort_order
export async function PATCH(req: NextRequest) {
  const updates = await req.json();
  if (!Array.isArray(updates)) return NextResponse.json({ error: 'Expected array' }, { status: 400 });
  
  const promises = updates.map((u: any) => 
    supabase.from('weekly_plan_activities').update({ sort_order: u.sort_order }).eq('id', u.id)
  );
  
  const results = await Promise.all(promises);
  const errs = results.filter(r => r.error);
  
  if (errs.length > 0) {
    // Si la columna no existe, ignoramos el fallo de reordenamiento pacíficamente.
    if (errs[0].error?.code === '42703') return NextResponse.json({ success: true, warning: 'sort_order not added' });
    return NextResponse.json({ error: errs[0].error?.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
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
