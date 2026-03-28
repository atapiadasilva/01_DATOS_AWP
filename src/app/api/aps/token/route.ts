import { NextResponse } from 'next/server';
import { getViewerToken } from '@/lib/aps';

export async function GET() {
  try {
    const token = await getViewerToken();
    return NextResponse.json(token);
  } catch (err: any) {
    console.error('[APS token]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
