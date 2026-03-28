'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Box, AlertCircle, RefreshCw } from 'lucide-react';

declare global { interface Window { Autodesk: any; THREE: any } }

export interface ElementColor { externalId: string; hex: string; alpha?: number }

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
  selectionIds?:      string[];
  globalGrey?:        boolean;
}

export default function APSViewer4D({
  onSelectionChange,
  onModelUrnReady,
  elementColors,
  selectionIds,
  globalGrey = true,
}: APSViewer4DProps = {}) {
  const containerRef        = useRef<HTMLDivElement>(null);
  const viewerRef           = useRef<any>(null);
  const extIdToDbIdRef      = useRef<Record<string, number>>({});
  const elementColorsRef    = useRef<ElementColor[]>([]);
  const modelLoadedRef      = useRef(false);

  const [sdkReady,    setSdkReady]    = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [status,      setStatus]      = useState('Inicializando Viewer…');
  const [error,       setError]       = useState('');
  const [modelName,   setModelName]   = useState('');

  // Keep ref in sync so event handlers see latest colors
  useEffect(() => { elementColorsRef.current = elementColors ?? []; }, [elementColors]);

  // Apply 4D state whenever elementColors or ghostMode changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !modelLoadedRef.current) return;

    // 1. Collect the dbIds that are "active" (have a status color)
    const activeDbIds = (elementColors ?? [])
      .map(({ externalId }) => extIdToDbIdRef.current[externalId])
      .filter((id): id is number => id != null);

    // 2. Ghost mode: use viewer.isolate() — APS natively makes non-isolated elements
    //    transparent/ghost. This gives real transparency, not a color hack.
    if (globalGrey && activeDbIds.length > 0) {
      viewer.isolate(activeDbIds, viewer.model);
    } else {
      // No active elements yet, or ghost mode off → show everything normally
      viewer.isolate(undefined, viewer.model);
    }

    // 3. Apply vivid status colors on top of the isolated elements
    viewer.clearThemingColors();
    for (const { externalId, hex, alpha } of (elementColors ?? [])) {
      const dbId = extIdToDbIdRef.current[externalId];
      if (dbId == null) continue;
      viewer.setThemingColor(dbId, hexToVec4(hex, alpha ?? 0.95), viewer.model, true);
    }

    viewer.impl?.invalidate(true);
  }, [elementColors, globalGrey]);


  // Load APS SDK (shared across tabs — idempotent)
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

        // Selection → emit externalIds
        viewer.addEventListener(
          window.Autodesk.Viewing.SELECTION_CHANGED_EVENT,
          async (ev: any) => {
            const dbIds: number[] = ev.dbIdArray ?? [];
            if (!dbIds.length) { onSelectionChange?.([]); return; }
            const extIds = await Promise.all(
              dbIds.map(dbId => new Promise<string>(res =>
                viewer.getProperties(dbId, (p: any) => res(p.externalId ?? String(dbId)),
                  () => res(String(dbId)))
              ))
            );
            onSelectionChange?.(extIds);
          }
        );

        // After geometry loads: build extId map then apply any pending colors
        viewer.addEventListener(
          window.Autodesk.Viewing.GEOMETRY_LOADED_EVENT,
          () => {
            viewer.model?.getExternalIdMapping((extMap: Record<string, number>) => {
              extIdToDbIdRef.current = extMap;
              modelLoadedRef.current = true;
              // Re-trigger the colors effect now that dbId map is ready
              // by forcing a re-render via a dummy state update is not needed —
              // the useEffect below reads elementColorsRef directly on next tick.
              // We call the isolation logic inline instead:
              const colors = elementColorsRef.current;
              const activeDbIds = colors
                .map(({ externalId }) => extMap[externalId])
                .filter((id): id is number => id != null);
              if (activeDbIds.length > 0) {
                viewer.isolate(activeDbIds, viewer.model);
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
        (doc: any) => {
          viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry());
          setStatus('');
        },
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
              <button
                onClick={() => { setError(''); viewerRef.current && loadModel(viewerRef.current); }}
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
}
