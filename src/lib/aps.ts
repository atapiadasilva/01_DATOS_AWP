// ─── APS (Autodesk Platform Services) client ─────────────────────────────────
// Server-side only. Never import from client components.

const APS_AUTH   = 'https://developer.api.autodesk.com/authentication/v2/token';
const APS_DM     = 'https://developer.api.autodesk.com';

type CachedToken = { token: string; expires: number; expires_in: number };
let _internal: CachedToken | null = null;
let _viewer:   CachedToken | null = null;

async function fetchToken(scopes: string[]): Promise<CachedToken> {
  const resp = await fetch(APS_AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.APS_CLIENT_ID!,
      client_secret: process.env.APS_CLIENT_SECRET!,
      grant_type:    'client_credentials',
      scope:         scopes.join(' '),
    }),
    cache: 'no-store',
  });
  if (!resp.ok) throw new Error(`APS auth error ${resp.status}: ${await resp.text()}`);
  const d = await resp.json();
  return { token: d.access_token, expires_in: d.expires_in, expires: Date.now() + (d.expires_in - 60) * 1000 };
}

// Token for server-side Data Management calls
export async function getInternalToken(): Promise<string> {
  if (_internal && _internal.expires > Date.now()) return _internal.token;
  _internal = await fetchToken(['data:read', 'data:write', 'data:create', 'account:read', 'bucket:create', 'bucket:read']);
  return _internal.token;
}

// Token returned to the browser for the Viewer SDK
export async function getViewerToken(): Promise<{ access_token: string; expires_in: number }> {
  if (_viewer && _viewer.expires > Date.now()) return { access_token: _viewer.token, expires_in: _viewer.expires_in };
  _viewer = await fetchToken(['viewables:read']);
  return { access_token: _viewer.token, expires_in: _viewer.expires_in };
}

// ─── Data Management helpers ──────────────────────────────────────────────────

async function dm<T = any>(path: string): Promise<T> {
  const token = await getInternalToken();
  const resp  = await fetch(`${APS_DM}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!resp.ok) throw new Error(`APS DM ${path} → ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function getHubs() {
  const data = await dm('/project/v1/hubs');
  return (data.data as any[]).map(h => ({
    id:   h.id,
    name: h.attributes.name,
    type: h.attributes.extension?.type?.includes('BIM360') ? 'bim360' : 'acc',
  }));
}

export async function getProjects(hubId: string) {
  const data = await dm(`/project/v1/hubs/${encodeURIComponent(hubId)}/projects`);
  return (data.data as any[]).map(p => ({
    id:   p.id,
    name: p.attributes.name,
    hubId,
  }));
}

export async function getTopFolders(hubId: string, projectId: string) {
  const data = await dm(
    `/project/v1/hubs/${encodeURIComponent(hubId)}/projects/${encodeURIComponent(projectId)}/topFolders`
  );
  return (data.data as any[]).map(f => ({
    id:        f.id,
    name:      f.attributes.name,
    projectId,
    type:      'folder' as const,
  }));
}

export async function getFolderContents(projectId: string, folderId: string) {
  const data = await dm(
    `/data/v1/projects/${encodeURIComponent(projectId)}/folders/${encodeURIComponent(folderId)}/contents`
  );
  return (data.data as any[]).map(item => {
    const displayName: string = item.attributes.displayName ?? item.attributes.name ?? '';
    // Extract extension from the display name (most reliable for ACC)
    const extFromName = displayName.includes('.') ? displayName.split('.').pop()!.toLowerCase() : '';
    const extension   = extFromName || (item.attributes.fileType ?? '').toLowerCase();
    return {
      id:        item.id,
      name:      displayName,
      type:      item.type as 'folders' | 'items',
      projectId,
      extension,
    };
  });
}

// Converts a plain URN string to base64 for the viewer.
// If the ID is already base64 (ACC returns it pre-encoded), returns it as-is.
function toViewerUrn(id: string): string {
  return id.startsWith('urn:')
    ? Buffer.from(id).toString('base64').replace(/=/g, '')
    : id; // already base64
}

// Returns the viewer URN for a given item, or null if not translatable
export async function getItemUrn(projectId: string, itemId: string): Promise<string | null> {
  const data = await dm(
    `/data/v1/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemId)}/versions`
  );
  const versions: any[] = data.data ?? [];
  if (!versions.length) return null;

  const latest = versions[0];

  // Primary: derivatives relationship (ACC/BIM360 - may be plain URN or already base64)
  const derivId: string | undefined = latest.relationships?.derivatives?.data?.id;
  if (derivId) return toViewerUrn(derivId);

  // Secondary: use version ID directly (plain urn:adsk.wipprod:fs.file:vf.XXX?version=Y)
  const versionId: string | undefined = latest.id;
  if (versionId) return toViewerUrn(versionId);

  // Fallback: storage object (OSS)
  const storageId: string | undefined = latest.relationships?.storage?.data?.id;
  if (storageId) return toViewerUrn(storageId);

  return null;
}

// ─── Default model: ANDINA VCAD 27-01-26.nwd ────────────────────────────────
// Path in ACC: project "MODELOS PARA VCAD" → top folders → file
// Cached in memory after first successful lookup.

const DEFAULT_MODEL_FILE    = 'ANDINA VCAD 27-01-26.nwd';
const DEFAULT_PROJECT_MATCH = 'VCAD';          // substring match on project name

let _defaultModel: { urn: string; name: string } | null = null;

export async function getDefaultModelUrn(): Promise<{ urn: string; name: string } | null> {
  if (_defaultModel) return _defaultModel;

  // ⚡ Fast path: URN hardcodeado en .env.local → carga instantánea sin tocar ACC
  if (process.env.APS_DEFAULT_URN) {
    _defaultModel = { urn: process.env.APS_DEFAULT_URN, name: DEFAULT_MODEL_FILE };
    console.log('[APS] URN desde .env — carga directa');
    return _defaultModel;
  }

  console.log('[APS] Buscando modelo:', DEFAULT_MODEL_FILE);

  const hubs = await getHubs();

  for (const hub of hubs) {
    const projects = await getProjects(hub.id);

    // Only search in the VCAD project
    const vcadProject = projects.find(p =>
      p.name.toUpperCase().includes(DEFAULT_PROJECT_MATCH)
    );
    if (!vcadProject) continue;

    console.log('[APS] Proyecto encontrado:', vcadProject.name, vcadProject.id);

    const topFolders = await getTopFolders(hub.id, vcadProject.id);

    // Search all top-level folders and one level of subfolders
    for (const folder of topFolders) {
      console.log('[APS] Carpeta top:', folder.name);
      const result = await findFileInFolder(vcadProject.id, folder.id);
      if (result) {
        _defaultModel = result;
        console.log('[APS] Modelo listo → URN:', result.urn);
        return _defaultModel;
      }
    }
  }

  console.warn('[APS] Modelo no encontrado:', DEFAULT_MODEL_FILE);
  return null;
}

// Searches one folder and one level of subfolders for the target file
async function findFileInFolder(
  projectId: string,
  folderId:  string,
): Promise<{ urn: string; name: string } | null> {
  const contents = await dm(
    `/data/v1/projects/${encodeURIComponent(projectId)}/folders/${encodeURIComponent(folderId)}/contents`
  );
  const items: any[] = contents.data ?? [];

  const subfolders: any[] = [];

  for (const item of items) {
    const name: string = item.attributes.displayName ?? item.attributes.name ?? '';

    if (item.type === 'items' && name === DEFAULT_MODEL_FILE) {
      const urn = await getItemUrn(projectId, item.id);
      if (urn) return { urn, name };
    }

    if (item.type === 'folders') subfolders.push(item);
  }

  // One level deeper
  for (const sub of subfolders) {
    const subName: string = sub.attributes.displayName ?? sub.attributes.name ?? '';
    console.log('[APS] Subcarpeta:', subName);
    const contents2 = await dm(
      `/data/v1/projects/${encodeURIComponent(projectId)}/folders/${encodeURIComponent(sub.id)}/contents`
    );
    for (const item of contents2.data ?? []) {
      const name: string = item.attributes.displayName ?? item.attributes.name ?? '';
      if (item.type === 'items' && name === DEFAULT_MODEL_FILE) {
        const urn = await getItemUrn(projectId, item.id);
        if (urn) return { urn, name };
      }
    }
  }

  return null;
}
