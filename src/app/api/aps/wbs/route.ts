import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function excelToIso(serial: any): string | null {
  if (!serial) return null;
  const n = Number(serial);
  if (isNaN(n) || n <= 0) {
    if (typeof serial === 'string' && serial.includes('.')) {
        const parts = serial.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (parts) return `${parts[3]}-${parts[2]}-${parts[1]}`;
    }
    return null;
  }
  try {
    return new Date(Math.round((n - 25569) * 86400000)).toISOString().split('T')[0];
  } catch (e) {
    return null;
  }
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
  const debugLogs: string[] = [];
  debugLogs.push(`Project ID: ${projectId}`);

  let entQ = supabase.from('entities').select('id, project_id').eq('name', 'PROGRAMA DE OBRA ACTUALIZADO');
  const { data: ents, error: entErr } = await entQ;
  
  if (entErr) {
    return NextResponse.json({ error: entErr.message, debug: debugLogs }, { status: 500 });
  }

  debugLogs.push(`Found ${ents?.length ?? 0} entities by name`);

  let targetEnt = ents?.find(e => e.project_id === projectId);
  if (!targetEnt && ents?.length) {
    debugLogs.push(`Fallback to first entity: ${ents[0].id} (Project: ${ents[0].project_id})`);
    targetEnt = ents[0];
  }

  if (!targetEnt) {
    return NextResponse.json({ debug: debugLogs, tasks: [] });
  }

  const { data: records, error } = await supabase
    .from('data_records')
    .select('data')
    .eq('entity_id', targetEnt.id);

  if (error) return NextResponse.json({ error: error.message, debug: debugLogs }, { status: 500 });
  
  debugLogs.push(`Found ${records?.length ?? 0} records for entity ${targetEnt.id}`);

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

  const result = tasks.map((t: any) => ({
    ...t,
    hasChildren: tasks.some(
      (o: any) => o.edt !== t.edt && o.edt.startsWith(t.edt + '.')
        && o.edt.split('.').length === t.edt.split('.').length + 1
    ),
  }));

  return NextResponse.json({
    debug: debugLogs,
    tasks: result
  });
}
