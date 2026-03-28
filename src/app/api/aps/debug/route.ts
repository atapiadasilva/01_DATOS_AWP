// Endpoint temporal de diagnóstico — lista hubs → proyectos → top folders → contenido
// Visita: GET /api/aps/debug?step=hubs
//         GET /api/aps/debug?step=projects&hubId=...
//         GET /api/aps/debug?step=folders&hubId=...&projectId=...
//         GET /api/aps/debug?step=contents&projectId=...&folderId=...
//         GET /api/aps/debug?step=urn&projectId=...&itemId=...

import { NextRequest, NextResponse } from 'next/server';
import { getInternalToken, getItemUrn } from '@/lib/aps';

const DM = 'https://developer.api.autodesk.com';

async function dmGet(path: string) {
  const token = await getInternalToken();
  const r = await fetch(`${DM}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export async function GET(req: NextRequest) {
  const p    = req.nextUrl.searchParams;
  const step = p.get('step') ?? 'hubs';

  try {
    if (step === 'hubs') {
      const d = await dmGet('/project/v1/hubs');
      return NextResponse.json(d.data.map((h: any) => ({ id: h.id, name: h.attributes.name })));
    }

    if (step === 'projects') {
      const hubId = p.get('hubId')!;
      const d = await dmGet(`/project/v1/hubs/${encodeURIComponent(hubId)}/projects`);
      return NextResponse.json(d.data.map((x: any) => ({ id: x.id, name: x.attributes.name })));
    }

    if (step === 'folders') {
      const hubId = p.get('hubId')!;
      const projectId = p.get('projectId')!;
      const d = await dmGet(`/project/v1/hubs/${encodeURIComponent(hubId)}/projects/${encodeURIComponent(projectId)}/topFolders`);
      return NextResponse.json(d.data.map((x: any) => ({ id: x.id, name: x.attributes.name })));
    }

    if (step === 'contents') {
      const projectId = p.get('projectId')!;
      const folderId  = p.get('folderId')!;
      const d = await dmGet(`/data/v1/projects/${encodeURIComponent(projectId)}/folders/${encodeURIComponent(folderId)}/contents`);
      return NextResponse.json(d.data.map((x: any) => ({
        id:   x.id,
        name: x.attributes.displayName ?? x.attributes.name,
        type: x.type,
      })));
    }

    if (step === 'urn') {
      const projectId = p.get('projectId')!;
      const itemId    = p.get('itemId')!;
      const urn = await getItemUrn(projectId, itemId);
      return NextResponse.json({ urn });
    }

    return NextResponse.json({ error: 'step inválido' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
