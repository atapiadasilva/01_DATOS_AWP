import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── WBS column defaults ────────────────────────────────────────────────────────
const DEFAULTS = {
  wbs_entity_name:        'PROGRAMA DE OBRA ACTUALIZADO',
  wbs_col_edt:            'EDT',
  wbs_col_name:           'Nombre de tarea',
  wbs_col_start:          'Comienzo Actual',
  wbs_col_end:            'Fin Actual',
  wbs_col_baseline_start: 'Comienzo de línea base1',
  wbs_col_baseline_end:   'Fin de línea base1',
  wbs_col_progress:       '% trabajo completado',
  wbs_col_duration:       'Duración',
  wbs_col_discipline:     'Disciplina',
  wbs_col_cwp:            null as string | null,
};

async function loadProjectCfg(projectId: string | null) {
  let cfg = { ...DEFAULTS };
  if (!projectId) return cfg;
  const { data: settings } = await supabase
    .from('project_settings')
    .select('*')
    .eq('project_id', projectId)
    .single();
  if (settings) {
    cfg = {
      wbs_entity_name:        settings.wbs_entity_name        || DEFAULTS.wbs_entity_name,
      wbs_col_edt:            settings.wbs_col_edt            || DEFAULTS.wbs_col_edt,
      wbs_col_name:           settings.wbs_col_name           || DEFAULTS.wbs_col_name,
      wbs_col_start:          settings.wbs_col_start          || DEFAULTS.wbs_col_start,
      wbs_col_end:            settings.wbs_col_end            || DEFAULTS.wbs_col_end,
      wbs_col_baseline_start: settings.wbs_col_baseline_start || DEFAULTS.wbs_col_baseline_start,
      wbs_col_baseline_end:   settings.wbs_col_baseline_end   || DEFAULTS.wbs_col_baseline_end,
      wbs_col_progress:       settings.wbs_col_progress       || DEFAULTS.wbs_col_progress,
      wbs_col_duration:       settings.wbs_col_duration       || DEFAULTS.wbs_col_duration,
      wbs_col_discipline:     settings.wbs_col_discipline      || DEFAULTS.wbs_col_discipline,
      wbs_col_cwp:            settings.wbs_col_cwp            || null,
    };
  }
  return cfg;
}

function excelToIso(serial: any): string | null {
  if (!serial) return null;
  if (typeof serial === 'string' && /^\d{4}-\d{2}-\d{2}/.test(serial)) {
    return serial.split('T')[0];
  }
  const n = Number(serial);
  if (isNaN(n) || n <= 0) {
    if (typeof serial === 'string') {
      const parts = serial.match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (parts) return `${parts[3]}-${parts[2]}-${parts[1]}`;
    }
    return null;
  }
  try {
    return new Date(Math.round((n - 25569) * 86400000)).toISOString().split('T')[0];
  } catch { return null; }
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

  // 1. Load per-project WBS column config
  const cfg = await loadProjectCfg(projectId);

  // 2. Get WBS links for this project/model
  let linksQ = supabase.from('aps_wbs_links').select('wbs_id, external_id, project_id');
  if (projectId) linksQ = linksQ.eq('project_id', projectId);
  if (modelUrn)  linksQ = linksQ.eq('model_urn',  modelUrn);

  let { data: links, error: linksErr } = await linksQ;
  if (linksErr) return NextResponse.json({ error: linksErr.message }, { status: 500 });

  // Fallback: if no links found with projectId filter, try without (legacy data)
  if (!links?.length && projectId && modelUrn) {
    const { data: fallbackLinks } = await supabase
      .from('aps_wbs_links')
      .select('wbs_id, external_id')
      .eq('model_urn', modelUrn);
    links = fallbackLinks as any;
  }

  if (!links?.length) return NextResponse.json([]);

  // Build map: wbs_id → [externalId, ...]
  const edtToIds: Record<string, string[]> = {};
  for (const l of links) {
    const key = l.wbs_id || (l as any).edt;
    if (!key) continue;
    if (!edtToIds[key]) edtToIds[key] = [];
    edtToIds[key].push(l.external_id);
  }
  const directLinkedEdts = new Set(Object.keys(edtToIds));

  // 3. Find WBS entity using per-project entity name
  const { data: ents } = await supabase
    .from('entities')
    .select('id, project_id')
    .eq('name', cfg.wbs_entity_name);

  if (!ents?.length) return NextResponse.json([]);

  // Prefer entity from current project; no cross-project fallback
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

  // 4. Map using per-project column names
  const allTasks = (records ?? []).map((r: any) => {
    const d   = r.data as Record<string, any>;
    const edt = String(d[cfg.wbs_col_edt] ?? '');
    return {
      edt,
      name:       (d[cfg.wbs_col_name] ?? '').toString().trim(),
      level:      edt.split('.').length - 1,
      start:      excelToIso(d[cfg.wbs_col_start]),
      end:        excelToIso(d[cfg.wbs_col_end]),
      baseStart:  excelToIso(d[cfg.wbs_col_baseline_start]),
      baseEnd:    excelToIso(d[cfg.wbs_col_baseline_end]),
      progress:   Math.round((Number(d[cfg.wbs_col_progress] ?? 0)) * 100),
      discipline: String(d[cfg.wbs_col_discipline] ?? ''),
    };
  });

  // 5. Include directly-linked tasks + their ancestor summary tasks
  const includedEdts = new Set<string>();
  for (const edt of Array.from(directLinkedEdts)) {
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

export async function PUT(req: NextRequest) {
  const { projectId, edt, startDate, endDate } = await req.json();
  if (!projectId || !edt || !startDate || !endDate)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  // Load per-project config to get correct column + entity names
  const cfg = await loadProjectCfg(projectId);

  // Find WBS entity for this project
  const { data: ents } = await supabase
    .from('entities')
    .select('id')
    .eq('name', cfg.wbs_entity_name)
    .eq('project_id', projectId);

  if (!ents?.length)
    return NextResponse.json({ error: `No WBS entity "${cfg.wbs_entity_name}" found for project` }, { status: 404 });

  // Find the specific EDT record
  const { data: records, error: fetchErr } = await supabase
    .from('data_records')
    .select('id, data')
    .in('entity_id', ents.map(e => e.id));

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  const record = (records ?? []).find((r: any) => String(r.data?.[cfg.wbs_col_edt]) === String(edt));
  if (!record)
    return NextResponse.json({ error: `Record not found for ${cfg.wbs_col_edt} = ${edt}` }, { status: 404 });

  // Update dates using per-project column names
  const updatedData = {
    ...(record.data as any),
    [cfg.wbs_col_start]: startDate,
    [cfg.wbs_col_end]:   endDate,
  };

  const { error: updateErr } = await supabase
    .from('data_records')
    .update({ data: updatedData })
    .eq('id', record.id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
