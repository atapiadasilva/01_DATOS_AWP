import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── WBS column defaults (used when project_settings has no override) ──────────
const DEFAULTS = {
  wbs_entity_name:       'PROGRAMA DE OBRA ACTUALIZADO',
  wbs_col_edt:           'EDT',
  wbs_col_name:          'Nombre de tarea',
  wbs_col_start:         'Comienzo Actual',
  wbs_col_end:           'Fin Actual',
  wbs_col_baseline_start:'Comienzo de línea base1',
  wbs_col_baseline_end:  'Fin de línea base1',
  wbs_col_progress:      '% trabajo completado',
  wbs_col_duration:      'Duración',
  wbs_col_discipline:    'Disciplina',
  wbs_col_cwp:           null as string | null,
  wbs_col_hh:            null as string | null,
};

function excelToIso(serial: any): string | null {
  if (!serial) return null;
  const n = Number(serial);
  if (isNaN(n) || n <= 0) {
    if (typeof serial === 'string') {
      const m = serial.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
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
  const projectId  = req.nextUrl.searchParams.get('projectId');
  const debugLogs: string[] = [`Project ID: ${projectId}`];

  // ── 1. Load per-project column mappings ───────────────────────────────────
  let cfg = { ...DEFAULTS };
  if (projectId) {
    const { data: settings } = await supabase
      .from('project_settings')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (settings) {
      cfg = {
        wbs_entity_name:       settings.wbs_entity_name       || DEFAULTS.wbs_entity_name,
        wbs_col_edt:           settings.wbs_col_edt           || DEFAULTS.wbs_col_edt,
        wbs_col_name:          settings.wbs_col_name          || DEFAULTS.wbs_col_name,
        wbs_col_start:         settings.wbs_col_start         || DEFAULTS.wbs_col_start,
        wbs_col_end:           settings.wbs_col_end           || DEFAULTS.wbs_col_end,
        wbs_col_baseline_start:settings.wbs_col_baseline_start|| DEFAULTS.wbs_col_baseline_start,
        wbs_col_baseline_end:  settings.wbs_col_baseline_end  || DEFAULTS.wbs_col_baseline_end,
        wbs_col_progress:      settings.wbs_col_progress      || DEFAULTS.wbs_col_progress,
        wbs_col_duration:      settings.wbs_col_duration      || DEFAULTS.wbs_col_duration,
        wbs_col_discipline:    settings.wbs_col_discipline     || DEFAULTS.wbs_col_discipline,
        wbs_col_cwp:           settings.wbs_col_cwp           || null,
        wbs_col_hh:            settings.wbs_col_hh            || null,
      };
      debugLogs.push(`Using project settings (entity: "${cfg.wbs_entity_name}")`);
    }
  }

  // ── 2. Find the WBS entity ────────────────────────────────────────────────
  let entQ = supabase
    .from('entities')
    .select('id, project_id')
    .eq('name', cfg.wbs_entity_name);

  const { data: ents, error: entErr } = await entQ;
  if (entErr) return NextResponse.json({ error: entErr.message, debug: debugLogs }, { status: 500 });

  debugLogs.push(`Found ${ents?.length ?? 0} entities named "${cfg.wbs_entity_name}"`);

  let targetEnt = ents?.find(e => e.project_id === projectId);
  if (!targetEnt && ents?.length) {
    debugLogs.push(`Fallback: using first entity (project ${ents[0].project_id})`);
    targetEnt = ents[0];
  }
  if (!targetEnt) return NextResponse.json({ debug: debugLogs, tasks: [] });

  // ── 3. Load records ───────────────────────────────────────────────────────
  const { data: records, error } = await supabase
    .from('data_records')
    .select('data')
    .eq('entity_id', targetEnt.id);

  if (error) return NextResponse.json({ error: error.message, debug: debugLogs }, { status: 500 });
  debugLogs.push(`Loaded ${records?.length ?? 0} records`);

  // ── 4. Map using per-project column names ─────────────────────────────────
  const tasks = (records ?? []).map((r: any) => {
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
      duration:   d[cfg.wbs_col_duration] ?? '',
      discipline: d[cfg.wbs_col_discipline] ?? '',
      cwp:        cfg.wbs_col_cwp ? (d[cfg.wbs_col_cwp] ?? '') : undefined,
      hh:         cfg.wbs_col_hh  ? (parseFloat(d[cfg.wbs_col_hh]) || 0)   : 0,
    };
  });

  tasks.sort((a: any, b: any) => cmpEdt(a.edt, b.edt));

  const result = tasks.map((t: any) => ({
    ...t,
    hasChildren: tasks.some(
      (o: any) => o.edt !== t.edt
        && o.edt.startsWith(t.edt + '.')
        && o.edt.split('.').length === t.edt.split('.').length + 1
    ),
  }));

  return NextResponse.json({ debug: debugLogs, tasks: result, entityName: cfg.wbs_entity_name });
}
