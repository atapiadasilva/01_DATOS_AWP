'use client';

import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Loader2, Box, AlertCircle, RefreshCw } from 'lucide-react';

declare global { interface Window { Autodesk: any; THREE: any } }

export interface ElementColor { externalId: string; hex: string; alpha?: number }

// API exposed to parent via ref
export interface APSViewer4DHandle {
  zoomToElements: (externalIds: string[]) => void;
}

function hexToVec4(hex: string, alpha = 0.85): any {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return new window.THREE.Vector4(0.3, 0.6, 1, alpha);
  return new window.THREE.Vector4(
    parseInt(m[1], 16) / 255,
    parseInt(m[2], 16) / 255,
    parseInt(m[3], 16) / 255,
    alpha,
  );
}


interface APSViewer4DProps {
  onSelectionChange?: (externalIds: string[]) => void;
  onModelUrnReady?:   (urn: string) => void;
  elementColors?:     ElementColor[];
  doneIds?:           string[];
  globalGrey?:        boolean;
  selection?:         string[];
  disciplineFilter?:  string;
  /** ExternalIds to hard-isolate (from linked activities of the filtered discipline) */
  isolateIds?:        string[];
}

const APSViewer4D = forwardRef<APSViewer4DHandle, APSViewer4DProps>(function APSViewer4D({
  onSelectionChange,
  onModelUrnReady,
  elementColors,
  doneIds,
  globalGrey = true,
  selection = [],
  disciplineFilter = '',
  isolateIds,
}, ref) {
  const containerRef     = useRef<HTMLDivElement>(null);
  const viewerRef        = useRef<any>(null);
  const extIdToDbIdRef   = useRef<Record<string, number>>({});
  const dbIdToExtIdRef   = useRef<Record<number, string>>({});
  const elementColorsRef = useRef<ElementColor[]>([]);
  const doneIdsRef       = useRef<string[]>([]);
  const modelLoadedRef   = useRef(false);
  const globalGreyRef    = useRef<boolean>(true);

  const [sdkReady,    setSdkReady]    = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [status,      setStatus]      = useState('Inicializando Viewer…');
  const [error,       setError]       = useState('');
  const [modelName,   setModelName]   = useState('');
  const [filterDbIds, setFilterDbIds] = useState<number[] | null>(null);

  // ── Search model for discipline elements ───────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !modelLoadedRef.current) return;
    if (!disciplineFilter) { setFilterDbIds(null); return; }

    viewer.search(
      disciplineFilter,
      (dbIds: number[]) => setFilterDbIds(dbIds),
      (err: any) => { console.error('[APS4D] search error:', err); setFilterDbIds([]); },
      ['Category', 'Family Name', 'Especialidad', 'Discipline', 'System Type'],
      { exactMatch: false }
    );
  }, [disciplineFilter]);

  // ── Imperative API exposed to parent ──────────────────────────────────────
  useImperativeHandle(ref, () => ({
    zoomToElements(externalIds: string[]) {
      const viewer = viewerRef.current;
      if (!viewer || !modelLoadedRef.current) return;
      const dbIds = externalIds.map(id => extIdToDbIdRef.current[id]).filter((id): id is number => id != null);
      if (!dbIds.length) return;
      viewer.isolate(dbIds, viewer.model);
      viewer.fitToView(dbIds, viewer.model);
    },
  }), []);

  // Keep refs in sync
  useEffect(() => { elementColorsRef.current = elementColors ?? []; }, [elementColors]);
  useEffect(() => { doneIdsRef.current       = doneIds       ?? []; }, [doneIds]);
  useEffect(() => { globalGreyRef.current    = globalGrey    ?? true; }, [globalGrey]);

  // Programmatic selection from parent (chip click)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !modelLoadedRef.current) return;
    if (!selection?.length) { viewer.clearSelection(); return; }
    const dbIds = selection.map(id => extIdToDbIdRef.current[id]).filter((id): id is number => id != null);
    if (dbIds.length) {
      viewer.select(dbIds, viewer.model);
      viewer.fitToView(dbIds, viewer.model);
    }
  }, [selection]);

  // Apply 4D colors / ghost state / discipline filter
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !modelLoadedRef.current) return;
    const coloredDbIds = (elementColors ?? [])
      .map(({ externalId }) => extIdToDbIdRef.current[externalId])
      .filter((id): id is number => id != null);
    const doneDbIds = (doneIds ?? [])
      .map(id => extIdToDbIdRef.current[id])
      .filter((id): id is number => id != null);

    // Resolve isolateIds (externalIds from parent) → dbIds: most reliable discipline filter
    const isolateDbIds = isolateIds
      ? isolateIds.map(id => extIdToDbIdRef.current[id]).filter((id): id is number => id != null)
      : null;

    // Visibility logic (priority: isolateIds > filterDbIds from search > globalGrey)
    let visibleDbIds: number[] = [];

    const disciplineDbIds = isolateDbIds ?? filterDbIds; // prefer explicit ids over search results

    if (disciplineDbIds !== null) {
      // Discipline filter active: show only those elements
      if (globalGrey) {
        // Intersect with assigned elements so unlinked geometry is still ghosted
        const assignedSet = new Set([...coloredDbIds, ...doneDbIds]);
        const intersection = disciplineDbIds.filter(id => assignedSet.has(id));
        visibleDbIds = intersection.length > 0 ? intersection : disciplineDbIds;
      } else {
        visibleDbIds = disciplineDbIds;
      }
    } else {
      // No discipline filter — normal 4D behavior
      if (globalGrey) {
        const assigned = [...coloredDbIds, ...doneDbIds];
        visibleDbIds = assigned.length > 0 ? assigned : [-1];
      } else {
        viewer.showAll();
        visibleDbIds = [];
      }
    }

    if (visibleDbIds.length > 0 || (filterDbIds !== null && visibleDbIds.length === 0)) {
      viewer.isolate(visibleDbIds.length > 0 ? visibleDbIds : [-1], viewer.model);
    }

    viewer.clearThemingColors();
    for (const { externalId, hex, alpha } of (elementColors ?? [])) {
      const dbId = extIdToDbIdRef.current[externalId];
      if (dbId == null) continue;
      viewer.setThemingColor(dbId, hexToVec4(hex, alpha ?? 0.95), viewer.model, true);
    }
    viewer.impl?.invalidate(true);
  }, [elementColors, doneIds, globalGrey, filterDbIds, isolateIds]);

  // Load APS SDK
  useEffect(() => {
    if (window.Autodesk?.Viewing) { setSdkReady(true); return; }
    const existing = document.getElementById('aps-viewer-js') as HTMLScriptElement | null;
    if (existing) { existing.addEventListener('load', () => setSdkReady(true)); return; }
    if (!document.getElementById('aps-viewer-css')) {
      document.head.appendChild(Object.assign(document.createElement('link'), {
        id: 'aps-viewer-css', rel: 'stylesheet',
        href: 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/style.css',
      }));
    }
    const script = Object.assign(document.createElement('script'), {
      id: 'aps-viewer-js',
      src: 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.js',
    });
    script.onload  = () => setSdkReady(true);
    script.onerror = () => setError('No se pudo cargar el SDK del viewer APS.');
    document.head.appendChild(script);
  }, []);

  // Init viewer
  useEffect(() => {
    if (!sdkReady || !containerRef.current || viewerRef.current) return;
    let cancelled = false;
    const getAccessToken = async (cb: (t: string, e: number) => void) => {
      try {
        const r = await fetch('/api/aps/token');
        const { access_token, expires_in } = await r.json();
        cb(access_token, expires_in);
      } catch (e) { console.error('[APS4D] token:', e); }
    };
    window.Autodesk.Viewing.Initializer(
      { env: 'AutodeskProduction', api: 'derivativeV2', getAccessToken },
      () => {
        if (cancelled || !containerRef.current) return;
        const viewer = new window.Autodesk.Viewing.GuiViewer3D(containerRef.current, {});
        viewer.start();
        viewer.setTheme('dark-theme');
        viewerRef.current = viewer;
        viewer.addEventListener(
          window.Autodesk.Viewing.SELECTION_CHANGED_EVENT,
          (ev: any) => {
            const dbIds: number[] = ev.dbIdArray ?? [];
            if (!dbIds.length) { onSelectionChange?.([]); return; }
            const extIds = dbIds.map(dbId => dbIdToExtIdRef.current[dbId] ?? String(dbId));
            onSelectionChange?.(extIds);
          }
        );
        viewer.addEventListener(
          window.Autodesk.Viewing.GEOMETRY_LOADED_EVENT,
          () => {
            viewer.model?.getExternalIdMapping((extMap: Record<string, number>) => {
              extIdToDbIdRef.current = extMap;
              const db2ext: Record<number, string> = {};
              for (const [extId, dbId] of Object.entries(extMap)) db2ext[dbId] = extId;
              dbIdToExtIdRef.current = db2ext;
              modelLoadedRef.current = true;
              const colors       = elementColorsRef.current;
              const done         = doneIdsRef.current;
              const coloredDbIds = colors.map(({ externalId }) => extMap[externalId]).filter((id): id is number => id != null);
              const doneDbIds    = done.map(id => extMap[id]).filter((id): id is number => id != null);
              const isolateDbIds = [...coloredDbIds, ...doneDbIds];
              if (globalGreyRef.current) {
                viewer.isolate(isolateDbIds.length > 0 ? isolateDbIds : [-1], viewer.model);
              } else {
                viewer.showAll();
              }
              viewer.clearThemingColors();
              for (const { externalId, hex, alpha } of colors) {
                const dbId = extMap[externalId];
                if (dbId == null) continue;
                viewer.setThemingColor(dbId, hexToVec4(hex, alpha ?? 0.95), viewer.model, true);
              }
              viewer.impl?.invalidate(true);
            }, () => {});
          }
        );
        setViewerReady(true);
        loadModel(viewer);
      }
    );
    return () => {
      cancelled = true;
      modelLoadedRef.current = false;
      if (viewerRef.current) {
        try { viewerRef.current.finish(); window.Autodesk?.Viewing?.shutdown?.(); } catch { }
        viewerRef.current = null;
      }
    };
  }, [sdkReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadModel = useCallback(async (viewer: any) => {
    setStatus('Buscando modelo…');
    setError('');
    try {
      const r = await fetch('/api/aps/default-model');
      if (!r.ok) { setError((await r.json()).error ?? 'Modelo no encontrado'); setStatus(''); return; }
      const { urn, name } = await r.json();
      onModelUrnReady?.(urn);
      setModelName(name);
      setStatus(`Cargando ${name}…`);
      window.Autodesk.Viewing.Document.load(
        `urn:${urn}`,
        (doc: any) => { viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry()); setStatus(''); },
        (code: number, msg: string) => { setError(`Error (${code}): ${msg}`); setStatus(''); }
      );
    } catch (e: any) { setError(`Error: ${e.message}`); setStatus(''); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-900">
      {(status || error) && (
        <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-4 py-2 text-xs
          bg-white/95 border-b border-slate-200 backdrop-blur-sm">
          {error ? (
            <>
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span className="text-red-600 flex-1">{error}</span>
              <button onClick={() => { setError(''); viewerRef.current && loadModel(viewerRef.current); }}
                className="flex items-center gap-1 text-slate-500 hover:text-slate-800 text-xs">
                <RefreshCw className="w-3.5 h-3.5" /> Reintentar
              </button>
            </>
          ) : (
            <>
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
              <span className="text-slate-600">{status}</span>
            </>
          )}
        </div>
      )}
      {!viewerReady && !error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-900">
          <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
          <span className="text-sm text-slate-300">{status}</span>
        </div>
      )}
      {modelName && !status && !error && (
        <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5
          bg-black/50 backdrop-blur-sm rounded-full text-white text-[11px] font-medium pointer-events-none">
          <Box className="w-3.5 h-3.5 text-blue-300" />
          {modelName}
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
});

export default APSViewer4D;
