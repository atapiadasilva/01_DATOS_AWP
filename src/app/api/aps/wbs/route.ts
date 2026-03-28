import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function excelToIso(serial: number | null | undefined): string | null {
  if (!serial) return null;
  return new Date(Math.round((serial - 25569) * 86400000)).toISOString().split('T')[0];
}

function cmpEdt(a: string, b: string): number {
  const ap = a.split('.').map(Number);
  const bp = b.split('.').map(Number);
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const d = (ap[i] ?? 0) - (bp[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');

  let entQ = supabase.from('entities').select('id').eq('name', 'PROGRAMA DE OBRA ACTUALIZADO');
  if (projectId) entQ = entQ.eq('project_id', projectId);
  const { data: ents } = await entQ;
  if (!ents?.length) return NextResponse.json([]);

  const { data: records, error } = await supabase
    .from('data_records')
    .select('data')
    .in('entity_id', ents.map((e: any) => e.id));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tasks = (records ?? []).map((r: any) => {
    const d = r.data as Record<string, any>;
    const edt  = String(d.EDT ?? '');
    const name = (d['Nombre de tarea'] ?? '').trim();
    return {
      edt,
      name,
      level:      edt.split('.').length - 1,
      start:      excelToIso(d['Comienzo Actual']),
      end:        excelToIso(d['Fin Actual']),
      baseStart:  excelToIso(d['Comienzo de línea base1']),
      baseEnd:    excelToIso(d['Fin de línea base1']),
      progress:   Math.round((d['% trabajo completado'] ?? 0) * 100),
      duration:   d['Duración'] ?? '',
      discipline: d['Disciplina'] ?? '',
    };
  });

  tasks.sort((a: any, b: any) => cmpEdt(a.edt, b.edt));

  // mark hasChildren
  const edts = new Set(tasks.map((t: any) => t.edt));
  const result = tasks.map((t: any) => ({
    ...t,
    hasChildren: tasks.some(
      (o: any) => o.edt !== t.edt && o.edt.startsWith(t.edt + '.')
        && o.edt.split('.').length === t.edt.split('.').length + 1
    ),
  }));

  return NextResponse.json(result);
}
