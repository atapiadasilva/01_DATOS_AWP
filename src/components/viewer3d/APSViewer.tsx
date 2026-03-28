'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Box, AlertCircle, RefreshCw, Layers } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import CWPAssignPanel, { cwpHexColor, type SelectedElement } from './CWPAssignPanel';
import CWPSummaryPanel from './CWPSummaryPanel';

declare global { interface Window { Autodesk: any; THREE: any } }

interface CWPOption {
  cwp_code:        string;
  cwp_description: string;
  discipline:      string;
}
type AssignmentMap = Record<string, string>;

/** Convert #rrggbb to THREE.Vector4 for APS Viewer setThemingColor */
function hexToVec4(hex: string, alpha = 0.7): any {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return new window.THREE.Vector4(0.3, 0.6, 1, alpha);
  return new window.THREE.Vector4(
    parseInt(m[1], 16) / 255,
    parseInt(m[2], 16) / 255,
    parseInt(m[3], 16) / 255,
    alpha,
  );
}

function buildSummary(
  assignments: AssignmentMap,
  cwps: CWPOption[]
): { cwp_code: string; cwp_description: string; discipline: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const cwp of Object.values(assignments)) {
    counts[cwp] = (counts[cwp] ?? 0) + 1;
  }
  return cwps
    .filter(c => counts[c.cwp_code] > 0)
    .map(c => ({
      cwp_code:        c.cwp_code,
      cwp_description: c.cwp_description,
      discipline:      c.discipline,
      count:           counts[c.cwp_code] ?? 0,
    }));
}

interface APSViewerProps {
  onSelectionChange?:    (externalIds: string[]) => void;
  onModelUrnReady?:      (urn: string) => void;
  highlightExternalIds?: string[];
}
export default function APSViewer({ onSelectionChange, onModelUrnReady, highlightExternalIds }: APSViewerProps = {}) {
  const { currentProject } = useProject();
  const containerRef       = useRef<HTMLDivElement>(null);
  const viewerRef          = useRef<any>(null);
  const modelUrnRef        = useRef<string>('');
  const extIdToDbIdRef     = useRef<Record<string, number>>({});
  const elemInfoRef        = useRef<Record<string, { name: string; category: string }>>({});
  const assignmentsRef     = useRef<AssignmentMap>({});
  // mirrors of state for use inside viewer event callbacks (avoid stale closures)
  const hiddenCwpsRef      = useRef<string[]>([]);
  const cwpColorsRef       = useRef<Record<string, string>>({});

  const [sdkReady,    setSdkReady]    = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [status,      setStatus]      = useState('Inicializando Autodesk Viewer…');
  const [error,       setError]       = useState('');
  const [modelName,   setModelName]   = useState('');
  const [cwps,        setCwps]        = useState<CWPOption[]>([]);
  const [selection,   setSelection]   = useState<SelectedElement[]>([]);
  const [saving,      setSaving]      = useState(false);
  const [summary,     setSummary]     = useState<ReturnType<typeof buildSummary>>([]);
  const [activeCwp,   setActiveCwp]   = useState<string | null>(null);
  // cwp_code → custom #rrggbb color (overrides default)
  const [cwpColors,   setCwpColors]   = useState<Record<string, string>>({});
  // set of cwp_codes currently hidden in the viewer
  const [hiddenCwps,  setHiddenCwps]  = useState<string[]>([]);

  // keep refs in sync with state so event callbacks always see fresh values
  useEffect(() => { hiddenCwpsRef.current = hiddenCwps; }, [hiddenCwps]);
  useEffect(() => { cwpColorsRef.current  = cwpColors;  }, [cwpColors]);

  useEffect(() => {
    if (!highlightExternalIds?.length || !viewerRef.current) return;
    const dbIds = highlightExternalIds
      .map(id => extIdToDbIdRef.current[id])
      .filter((id): id is number => id != null);
    if (dbIds.length) {
      viewerRef.current.select(dbIds);
      viewerRef.current.fitToView(dbIds);
    }
  }, [highlightExternalIds]);

  // helper: effective color for a CWP
  const getCwpColor = useCallback(
    (code: string) => cwpColors[code] ?? cwpHexColor(code),
    [cwpColors]
  );

  // ── Load CWPs ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const url = currentProject?.id
      ? `/api/aps/cwps?projectId=${currentProject.id}`
      : '/api/aps/cwps';
    fetch(url)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setCwps(data); })
      .catch(e => console.error('[CWPs]', e));
  }, [currentProject?.id]);

  // ── Load APS SDK ──────────────────────────────────────────────────────────
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

  // ── Init viewer ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sdkReady || !containerRef.current || viewerRef.current) return;
    if (!window.Autodesk?.Viewing) return;
    let cancelled = false;

    const getAccessToken = async (cb: (t: string, e: number) => void) => {
      try {
        const r = await fetch('/api/aps/token');
        const { access_token, expires_in } = await r.json();
        cb(access_token, expires_in);
      } catch (e) { console.error('[APS] token error', e); }
    };

    window.Autodesk.Viewing.Initializer(
      { env: 'AutodeskProduction', api: 'derivativeV2', getAccessToken },
      () => {
        if (cancelled || !containerRef.current) return;
        const viewer = new window.Autodesk.Viewing.GuiViewer3D(containerRef.current, {});
        viewer.start();
        viewer.setTheme('light-theme');
        viewerRef.current = viewer;

        viewer.addEventListener(
          window.Autodesk.Viewing.SELECTION_CHANGED_EVENT,
          async (ev: any) => {
            const dbIds: number[] = ev.dbIdArray ?? [];
            if (!dbIds.length) { setSelection([]); return; }
            const elements: SelectedElement[] = await Promise.all(
              dbIds.map(dbId => new Promise<SelectedElement>(resolve => {
                viewer.getProperties(dbId, (res: any) => {
                  const extId = res.externalId ?? String(dbId);
                  elemInfoRef.current[extId] = {
                    name:     res.name ?? '',
                    category: res.properties?.find((p: any) => p.displayName === 'Category')?.displayValue ?? '',
                  };
                  resolve({
                    dbId,
                    externalId: extId,
                    name:       res.name ?? '',
                    category:   res.properties?.find((p: any) => p.displayName === 'Category')?.displayValue ?? '',
                    currentCwp: assignmentsRef.current[extId],
                  });
                }, () => resolve({ dbId, externalId: String(dbId), name: '', category: '' }));
              }))
            );
            setSelection(elements);
            onSelectionChange?.(elements.map(e => e.externalId));
          }
        );

        viewer.addEventListener(
          window.Autodesk.Viewing.GEOMETRY_LOADED_EVENT,
          () => { applyColorsFromDB(viewer); }
        );

        // ── Intercept showAll (toolbar button + any caller) ──────────────
        // The toolbar "Show All" button calls viewer.showAll() directly.
        // We override it so React state always stays in sync.
        const _origShowAll = viewer.showAll.bind(viewer);
        viewer.showAll = () => {
          _origShowAll();
          const hidden = hiddenCwpsRef.current;
          if (!hidden.length) return;
          // Re-apply theming colors for every CWP that was hidden
          hidden.forEach(cwpCode => {
            const color = cwpColorsRef.current[cwpCode] ?? cwpHexColor(cwpCode);
            Object.entries(assignmentsRef.current)
              .filter(([, code]) => code === cwpCode)
              .forEach(([extId]) => {
                const dbId = extIdToDbIdRef.current[extId];
                if (dbId != null) viewer.setThemingColor(dbId, hexToVec4(color), viewer.model, true);
              });
          });
          setHiddenCwps([]);
        };

        setViewerReady(true);
        loadDefaultModel(viewer);
      }
    );

    return () => {
      cancelled = true;
      if (viewerRef.current) {
        try { viewerRef.current.finish(); window.Autodesk?.Viewing?.shutdown?.(); } catch { /* ok */ }
        viewerRef.current = null;
      }
    };
  }, [sdkReady]);

  // ── Load default model ────────────────────────────────────────────────────
  const loadDefaultModel = useCallback(async (viewer: any) => {
    setStatus('Buscando modelo ANDINA VCAD…');
    setError('');
    try {
      const r = await fetch('/api/aps/default-model');
      if (!r.ok) { setError((await r.json()).error ?? 'Modelo no encontrado'); setStatus(''); return; }
      const { urn, name } = await r.json();
      modelUrnRef.current = urn;
      onModelUrnReady?.(urn);
      setModelName(name);
      setStatus(`Cargando ${name}…`);
      window.Autodesk.Viewing.Document.load(
        `urn:${urn}`,
        (doc: any) => { viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry()); setStatus(''); },
        (code: number, msg: string) => { setError(`Error (${code}): ${msg}`); setStatus(''); }
      );
    } catch (e: any) { setError(`Error: ${e.message}`); setStatus(''); }
  }, []);

  // ── Apply CWP colors from DB ──────────────────────────────────────────────
  const applyColorsFromDB = useCallback(async (viewer: any) => {
    if (!currentProject?.id || !modelUrnRef.current) return;
    const r = await fetch(`/api/aps/elements?projectId=${currentProject.id}&modelUrn=${encodeURIComponent(modelUrnRef.current)}`);
    if (!r.ok) return;
    const assignments: { external_id: string; cwp_code: string }[] = await r.json();

    const map: AssignmentMap = {};
    assignments.forEach(a => { map[a.external_id] = a.cwp_code; });
    assignmentsRef.current = map;

    viewer.model.getExternalIdMapping((extMap: Record<string, number>) => {
      extIdToDbIdRef.current = extMap;
      viewer.clearThemingColors();
      assignments.forEach(({ external_id, cwp_code }) => {
        const dbId = extMap[external_id];
        if (dbId == null) return;
        viewer.setThemingColor(dbId, hexToVec4(cwpHexColor(cwp_code)), viewer.model, true);
      });
      setCwps(prev => { setSummary(buildSummary(map, prev)); return prev; });
    }, () => {});
  }, [currentProject?.id]);

  // ── Assign ────────────────────────────────────────────────────────────────
  const handleAssign = useCallback(async (cwpCode: string) => {
    if (!selection.length || !currentProject?.id) return;
    setSaving(true);
    try {
      const r = await fetch('/api/aps/elements', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          projectId: currentProject.id,
          modelUrn:  modelUrnRef.current,
          cwpCode,
          elements:  selection.map(el => ({ externalId: el.externalId, name: el.name, category: el.category })),
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error);

      const viewer = viewerRef.current;
      const color  = getCwpColor(cwpCode);
      selection.forEach(el => {
        assignmentsRef.current[el.externalId] = cwpCode;
        viewer?.setThemingColor(el.dbId, hexToVec4(color), viewer.model, true);
      });
      setSelection(prev => prev.map(el => ({ ...el, currentCwp: cwpCode })));
      setSummary(buildSummary(assignmentsRef.current, cwps));
    } catch (e: any) {
      setError(`Error al guardar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [selection, currentProject?.id, cwps, getCwpColor]);

  // ── Remove ────────────────────────────────────────────────────────────────
  const handleRemove = useCallback(async () => {
    if (!selection.length || !currentProject?.id) return;
    setSaving(true);
    try {
      await fetch('/api/aps/elements', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          projectId:   currentProject.id,
          modelUrn:    modelUrnRef.current,
          externalIds: selection.map(e => e.externalId),
        }),
      });
      const viewer = viewerRef.current;
      selection.forEach(el => {
        delete assignmentsRef.current[el.externalId];
        viewer?.setThemingColor(el.dbId, new window.THREE.Vector4(0, 0, 0, 0), viewer.model, true);
      });
      setSelection(prev => prev.map(el => ({ ...el, currentCwp: undefined })));
      setSummary(buildSummary(assignmentsRef.current, cwps));
    } catch (e: any) {
      setError(`Error al eliminar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [selection, currentProject?.id, cwps]);

  // ── Select CWP in viewer ──────────────────────────────────────────────────
  const handleCwpSelect = useCallback((cwpCode: string) => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (activeCwp === cwpCode) {
      viewer.clearSelection();
      setActiveCwp(null);
      setSelection([]);
      return;
    }

    const dbIds = Object.entries(assignmentsRef.current)
      .filter(([, code]) => code === cwpCode)
      .map(([id]) => extIdToDbIdRef.current[id])
      .filter((id): id is number => id != null);

    if (!dbIds.length) return;
    viewer.select(dbIds);
    viewer.fitToView(dbIds);
    setActiveCwp(cwpCode);
  }, [activeCwp]);

  // ── Toggle visibility ─────────────────────────────────────────────────────
  const handleToggleVisibility = useCallback((cwpCode: string) => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const dbIds = Object.entries(assignmentsRef.current)
      .filter(([, code]) => code === cwpCode)
      .map(([id]) => extIdToDbIdRef.current[id])
      .filter((id): id is number => id != null);

    if (!dbIds.length) return;

    setHiddenCwps(prev => {
      const isHidden = prev.includes(cwpCode);
      if (isHidden) {
        // Show: restore elements and re-apply theming color
        viewer.show(dbIds);
        const color = getCwpColor(cwpCode);
        dbIds.forEach(dbId => viewer.setThemingColor(dbId, hexToVec4(color), viewer.model, true));
        return prev.filter(c => c !== cwpCode);
      } else {
        // Hide
        viewer.hide(dbIds);
        return [...prev, cwpCode];
      }
    });
  }, [getCwpColor]);

  // ── Show all (sync panel + viewer) ───────────────────────────────────────
  const handleShowAll = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.showAll();
    // Re-apply theming colors for all hidden CWPs
    hiddenCwps.forEach(cwpCode => {
      const color = getCwpColor(cwpCode);
      Object.entries(assignmentsRef.current)
        .filter(([, code]) => code === cwpCode)
        .forEach(([extId]) => {
          const dbId = extIdToDbIdRef.current[extId];
          if (dbId != null) viewer.setThemingColor(dbId, hexToVec4(color), viewer.model, true);
        });
    });
    setHiddenCwps([]);
  }, [hiddenCwps, getCwpColor]);

  // ── Change color ──────────────────────────────────────────────────────────
  const handleColorChange = useCallback((cwpCode: string, hexColor: string) => {
    setCwpColors(prev => ({ ...prev, [cwpCode]: hexColor }));

    const viewer = viewerRef.current;
    if (!viewer) return;

    // Re-apply theming color to all elements of this CWP
    const dbIds = Object.entries(assignmentsRef.current)
      .filter(([, code]) => code === cwpCode)
      .map(([id]) => extIdToDbIdRef.current[id])
      .filter((id): id is number => id != null);

    dbIds.forEach(dbId =>
      viewer.setThemingColor(dbId, hexToVec4(hexColor), viewer.model, true)
    );
  }, []);

  return (
    <div className="flex w-full h-full overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-slate-900">

      {/* ── CWP Summary Panel (left) ───────────────────────────────────────── */}
      <CWPSummaryPanel
        items={summary}
        activeCwp={activeCwp}
        hiddenCwps={hiddenCwps}
        cwpColors={cwpColors}
        onSelect={handleCwpSelect}
        onToggleVisibility={handleToggleVisibility}
        onColorChange={handleColorChange}
        onShowAll={handleShowAll}
        onClearAll={() => {
          viewerRef.current?.clearSelection();
          setActiveCwp(null);
          setSelection([]);
        }}
      />

      {/* ── Viewer ─────────────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        {(status || error) && (
          <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-4 py-2 text-xs bg-white/95 border-b border-slate-200 backdrop-blur-sm">
            {error ? (
              <>
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <span className="text-red-600 flex-1">{error}</span>
                <button onClick={() => { setError(''); viewerRef.current && loadDefaultModel(viewerRef.current); }}
                  className="flex items-center gap-1 text-slate-500 hover:text-slate-800 transition-colors text-xs">
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

        {viewerReady && !selection.length && !status && !error && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-3 py-1.5
            bg-black/40 backdrop-blur-sm rounded-lg text-white/70 text-[10px] pointer-events-none">
            <Layers className="w-3 h-3 shrink-0" />
            Clic (o Shift+clic) en elementos para asignar CWP
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

      {/* ── CWP Assign Panel (right) ───────────────────────────────────────── */}
      {selection.length > 0 && (
        <CWPAssignPanel
          elements={selection}
          cwps={cwps}
          saving={saving}
          onAssign={handleAssign}
          onRemove={handleRemove}
          onClose={() => {
            setSelection([]);
            setActiveCwp(null);
            viewerRef.current?.clearSelection();
          }}
        />
      )}
    </div>
  );
}
