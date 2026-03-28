import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/aps/cwps?projectId=...
// 1. Tries cwp_master first (the canonical catalog)
// 2. Falls back to extracting unique CWPs from data_records
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');

  // ── Try cwp_master ────────────────────────────────────────────────────────
  let masterQuery = supabase
    .from('cwp_master')
    .select('cwp_code, cwp_description, discipline, ewp_code, pwp_code')
    .order('sort_order', { ascending: true })
    .order('cwp_code',   { ascending: true });

  if (projectId) masterQuery = masterQuery.eq('project_id', projectId);

  const { data: masterData } = await masterQuery;

  if (masterData && masterData.length > 0) {
    return NextResponse.json(masterData);
  }

  // ── Fallback: extract from data_records ───────────────────────────────────
  let recQuery = supabase
    .from('data_records')
    .select('data, entity_id');

  if (projectId) {
    // Join via entities to filter by project
    const { data: entities } = await supabase
      .from('entities')
      .select('id')
      .eq('project_id', projectId);
    const ids = (entities ?? []).map((e: any) => e.id);
    if (ids.length) recQuery = recQuery.in('entity_id', ids);
  }

  const { data: records, error } = await recQuery.limit(5000);

  if (error) {
    console.error('[CWPs fallback]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Deduplicate by CWP code, preserving description
  const seen: Record<string, { cwp_code: string; cwp_description: string; discipline: string }> = {};
  for (const row of records ?? []) {
    const d = row.data as Record<string, any>;
    const code = d?.CWP ?? d?.cwp ?? d?.['CWP Code'] ?? '';
    const desc = d?.['Nombre CWP'] ?? d?.['CWP Description'] ?? d?.['Nombre'] ?? '';
    const disc = d?.['Disciplina'] ?? d?.['Discipline'] ?? '';
    if (code && !seen[code]) {
      seen[code] = { cwp_code: String(code).trim(), cwp_description: String(desc).trim(), discipline: String(disc).trim() };
    }
  }

  const result = Object.values(seen).sort((a, b) => a.cwp_code.localeCompare(b.cwp_code));
  return NextResponse.json(result);
}
