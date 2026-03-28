import { NextResponse } from 'next/server';
import { getDefaultModelUrn } from '@/lib/aps';

export async function GET() {
  try {
    const model = await getDefaultModelUrn();
    if (!model) return NextResponse.json({ error: 'Modelo no encontrado' }, { status: 404 });
    return NextResponse.json(model);
  } catch (err: any) {
    console.error('[APS default-model]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
