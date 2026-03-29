import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDefaultModelUrn } from '@/lib/aps';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');

  try {
    // 1. Project-specific URN from project_settings table
    if (projectId) {
      const { data: settings } = await supabase
        .from('project_settings')
        .select('aps_model_urn, aps_model_name')
        .eq('project_id', projectId)
        .single();

      if (settings?.aps_model_urn) {
        return NextResponse.json({
          urn:  settings.aps_model_urn,
          name: settings.aps_model_name ?? 'Modelo',
        });
      }
    }

    // 2. Global fallback (env var or ACC search — existing logic)
    const model = await getDefaultModelUrn();
    if (!model) return NextResponse.json({ error: 'Modelo no encontrado' }, { status: 404 });
    return NextResponse.json(model);
  } catch (err: any) {
    console.error('[APS default-model]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
