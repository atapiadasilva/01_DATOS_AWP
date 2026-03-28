import { NextRequest, NextResponse } from 'next/server';
import { getHubs, getProjects, getTopFolders, getFolderContents, getItemUrn } from '@/lib/aps';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const type = p.get('type');

  try {
    switch (type) {
      case 'hubs':
        return NextResponse.json(await getHubs());

      case 'projects': {
        const hubId = p.get('hubId');
        if (!hubId) return NextResponse.json({ error: 'hubId required' }, { status: 400 });
        return NextResponse.json(await getProjects(hubId));
      }

      case 'folders': {
        const hubId     = p.get('hubId');
        const projectId = p.get('projectId');
        if (!hubId || !projectId) return NextResponse.json({ error: 'hubId and projectId required' }, { status: 400 });
        return NextResponse.json(await getTopFolders(hubId, projectId));
      }

      case 'contents': {
        const projectId = p.get('projectId');
        const folderId  = p.get('folderId');
        if (!projectId || !folderId) return NextResponse.json({ error: 'projectId and folderId required' }, { status: 400 });
        return NextResponse.json(await getFolderContents(projectId, folderId));
      }

      case 'urn': {
        const projectId = p.get('projectId');
        const itemId    = p.get('itemId');
        if (!projectId || !itemId) return NextResponse.json({ error: 'projectId and itemId required' }, { status: 400 });
        const urn = await getItemUrn(projectId, itemId);
        console.log('[APS urn] itemId:', itemId, '→ urn:', urn);
        return NextResponse.json({ urn });
      }

      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[APS tree]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
