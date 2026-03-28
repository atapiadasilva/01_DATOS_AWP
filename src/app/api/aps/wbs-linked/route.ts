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
  const modelUrn  = req.nextUrl.searchParams.get('modelUrn');

  // 1. Get all WBS links for this project/model
  // Using Service Role to bypass RLS and see all links
  let linksQ = supabase.from('aps_wbs_links').select('wbs_id, external_id, project_id');
  if (projectId) linksQ = linksQ.eq('project_id', projectId);
  if (modelUrn)  linksQ = linksQ.eq('model_urn',  modelUrn);
  
  let { data: links, error: linksErr } = await linksQ;
  if (linksErr) return NextResponse.json({ error: linksErr.message }, { status: 500 });

  // If no links found for specific projectId, and it's a zeroed project_id, try fallback
  if (!links?.length && projectId) {
      const { data: fallbackLinks } = await supabase
        .from('aps_wbs_links')
        .select('wbs_id, external_id')
        .eq('model_urn', modelUrn);
      links = fallbackLinks;
  }

  if (!links?.length) return NextResponse.json([]);

  // Build map: wbs_id → [externalId, ...]
  const edtToIds: Record<string, string[]> = {};
  for (const l of links) {
    const key = l.wbs_id || l.edt; // support legacy if any
    if (!key) continue;
    if (!edtToIds[key]) edtToIds[key] = [];
    edtToIds[key].push(l.external_id);
  }
  const directLinkedEdts = new Set(Object.keys(edtToIds));

  // 2. Get WBS tasks from PROGRAMA DE OBRA ACTUALIZADO
  let entQ = supabase.from('entities').select('id, project_id').eq('name', 'PROGRAMA DE OBRA ACTUALIZADO');
  const { data: ents } = await entQ;
  if (!ents?.length) return NextResponse.json([]);

  // Find right entity (exact match or first)
  let targetEnts = ents;
  if (projectId) {
      const filtered = ents.filter(e => e.project_id === projectId);
      if (filtered.length) targetEnts = filtered;
  }

  const { data: records, error: recErr } = await supabase
    .from('data_records')
    .select('data')
    .in('entity_id', targetEnts.map((e: any) => e.id));

  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 });

  const allTasks = (records ?? []).map((r: any) => {
    const d   = r.data as Record<string, any>;
    const edt = String(d.EDT ?? '');
    return {
      edt,
      name:       (d['Nombre de tarea'] ?? '').trim(),
      level:      edt.split('.').length - 1,
      start:      excelToIso(d['Comienzo Actual']),
      end:        excelToIso(d['Fin Actual']),
      baseStart:  excelToIso(d['Comienzo de línea base1']),
      baseEnd:    excelToIso(d['Fin de línea base1']),
      progress:   Math.round((d['% trabajo completado'] ?? 0) * 100),
      discipline: d['Disciplina'] ?? '',
    };
  });

  // 3. Include directly-linked tasks + their ancestor summary tasks
  const includedEdts = new Set<string>();
  for (const edt of directLinkedEdts) {
    includedEdts.add(edt);
    const parts = edt.split('.');
    for (let i = 1; i < parts.length; i++) {
      includedEdts.add(parts.slice(0, i).join('.'));
    }
  }

  const tasks = allTasks
    .filter(t => includedEdts.has(t.edt))
    .sort((a, b) => cmpEdt(a.edt, b.edt))
    .map(t => ({
      ...t,
      externalIds: edtToIds[t.edt] ?? [],
      hasChildren: allTasks.some(
        o => o.edt !== t.edt &&
          o.edt.startsWith(t.edt + '.') &&
          o.edt.split('.').length === t.edt.split('.').length + 1 &&
          includedEdts.has(o.edt)
      ),
    }));

  return NextResponse.json(tasks);
}
