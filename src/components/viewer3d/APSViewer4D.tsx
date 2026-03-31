'use client';

import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Loader2, Box, AlertCircle, RefreshCw } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';

declare global { interface Window { Autodesk: any; THREE: any } }

export interface ElementColor { externalId: string; hex: string; alpha?: number }

// API exposed to parent via ref
export interface TreeNodeInfo {
  id:          number;
  name:        string;
  hasChildren: boolean;
  childCount:  number;
}

export interface APSViewer4DHandle {
  zoomToElements:   (externalIds: string[]) => void;
  isolateByNodeId:  (nodeId: number | null) => void;
  getNodeChildren:  (nodeId: number | null) => TreeNodeInfo[]; // null = raíz
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
  onSelectionChange?:  (externalIds: string[]) => void;
  onModelUrnReady?:    (urn: string) => void;
  onModelTreeReady?:   (nodes: { id: number; name: string }[]) => void;
  elementColors?:      ElementColor[];
  doneIds?:            string[];
  globalGrey?:         boolean;
  selection?:          string[];
  /** Node IDs from the model tree to hard-filter (persistent, survives element clicks) */
  nodeFilterIds?:      number[];
  /** External IDs that should be hidden (viewer.hide) regardless of isolation state */
  hiddenIds?:          string[];
  /**
   * When true + globalGrey: if no elements are assigned/colored, hide ALL
   * (blank model) instead of showAll. Used by Aislar mode so the model
   * starts empty and elements appear progressively as they are executed.
   */
  strictIsolate?:      boolean;
}

const APSViewer4D = forwardRef<APSViewer4DHandle, APSViewer4DProps>(function APSViewer4D({
  onSelectionChange,
  onModelUrnReady,
  onModelTreeReady,
  elementColors,
  doneIds,
  globalGrey = true,
  selection = [],
  nodeFilterIds = [],
  hiddenIds = [],
  strictIsolate = false,
}, ref) {
  const { currentProject } = useProject();
  const containerRef     = useRef<HTMLDivElement>(null);
  const viewerRef        = useRef<any>(null);
  const extIdToDbIdRef   = useRef<Record<string, number>>({});
  const dbIdToExtIdRef   = useRef<Record<number, string>>({});
  const elementColorsRef = useRef<ElementColor[]>([]);
  const doneIdsRef       = useRef<string[]>([]);
  const modelLoadedRef   = useRef(false);
  const globalGreyRef    = useRef<boolean>(true);
  const instanceTreeRef  = useRef<any>(null);
  // Signature of last applied state — skip if unchanged to prevent flicker
  const lastAppliedSigRef = useRef<string>('');

  // ResizeObserver: notify Forge when container size changes (panel open/close, drag)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const viewer = viewerRef.current;
      if (viewer) viewer.resize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [sdkReady,    setSdkReady]    = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [status,      setStatus]      = useState('Inicializando Viewer…');
  const [error,       setError]       = useState('');
  const [modelName,   setModelName]   = useState('');

  // ── Imperative API exposed to parent ──────────────────────────────────────
  useImperativeHandle(ref, () => ({
    zoomToElements(externalIds: string[]) {
      const viewer = viewerRef.current;
      if (!viewer || !modelLoadedRef.current) return;
      const dbIds = externalIds.map(id => extIdToDbIdRef.current[id]).filter((id): id is number => id != null);
      if (!dbIds.length) return;
      // Solo zoom — NO isolate: dejar que React gestione la visibilidad vía props
      viewer.fitToView(dbIds, viewer.model);
    },

    isolateByNodeId(nodeId: number | null) {
      const viewer = viewerRef.current;
      if (!viewer || !modelLoadedRef.current) return;
      if (nodeId === null) { viewer.showAll(); return; }
      // Recopilar todos los dbIds descendientes del nodo
      const tree = viewer.model?.getInstanceTree();
      if (!tree) return;
      const dbIds: number[] = [];
      tree.enumNodeChildren(nodeId, (id: number) => { dbIds.push(id); }, true);
      if (dbIds.length) { viewer.isolate(dbIds, viewer.model); viewer.fitToView(dbIds, viewer.model); }
    },

    getNodeChildren(nodeId: number | null): TreeNodeInfo[] {
      const tree = instanceTreeRef.current;
      if (!tree) return [];
      const parentId = nodeId === null ? tree.getRootId() : nodeId;
      const result: TreeNodeInfo[] = [];
      tree.enumNodeChildren(parentId, (childId: number) => {
        const name = tree.getNodeName(childId);
        if (!name) return;
        let childCount = 0;
        tree.enumNodeChildren(childId, () => { childCount++; }, false);
        result.push({ id: childId, name, hasChildren: childCount > 0, childCount });
      }, false);
      return result;
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

    // Build a signature of the incoming state — skip expensive viewer ops if nothing changed
    const sig = JSON.stringify({
      ec: (elementColors ?? []).map(c => `${c.externalId}:${c.hex}:${c.alpha ?? 0.95}`).sort(),
      di: (doneIds ?? []).slice().sort(),
      gg: globalGrey,
      si: strictIsolate,
      nf: (nodeFilterIds ?? []).slice().sort(),
      hi: (hiddenIds ?? []).slice().sort(),
    });
    if (sig === lastAppliedSigRef.current) return;
    lastAppliedSigRef.current = sig;
    const coloredDbIds = (elementColors ?? [])
      .map(({ externalId }) => extIdToDbIdRef.current[externalId])
      .filter((id): id is number => id != null);
    const doneDbIds = (doneIds ?? [])
      .map(id => extIdToDbIdRef.current[id])
      .filter((id): id is number => id != null);

    // ── Nodo-filtro: recolectar dbIds de todos los nodos seleccionados ────────
    // Este filtro SIEMPRE persiste — no lo borra ningún click ni cambio de estado
    let nodeDbIds: number[] | null = null;
    if (nodeFilterIds.length > 0) {
      const tree = viewer.model?.getInstanceTree();
      if (tree) {
        const ids: number[] = [];
        nodeFilterIds.forEach(nodeId => {
          tree.enumNodeChildren(nodeId, (id: number) => ids.push(id), true);
        });
        nodeDbIds = ids.length > 0 ? ids : null;
      }
    }

    // ── Lógica de visibilidad ─────────────────────────────────────────────────
    // Prioridad: nodeFilter > globalGrey
    // Si hay filtro de nodo: SIEMPRE mostrar solo esos elementos (el filtro manda)
    // Si no hay filtro: comportamiento 4D normal
    let visibleDbIds: number[] = [];

    if (nodeDbIds !== null) {
      // Filtro activo → mostrar todos los elementos del nodo seleccionado
      // Si globalGrey: además aislar solo los asignados dentro del nodo
      if (globalGrey) {
        const assignedSet = new Set([...coloredDbIds, ...doneDbIds]);
        const intersection = nodeDbIds.filter(id => assignedSet.has(id));
        visibleDbIds = intersection.length > 0 ? intersection : nodeDbIds;
      } else {
        visibleDbIds = nodeDbIds; // mostrar todo el nodo, colores encima
      }
      viewer.isolate(visibleDbIds, viewer.model);
    } else {
      // Sin filtro — comportamiento 4D / Aislar normal
      if (globalGrey) {
        const assigned = [...coloredDbIds, ...doneDbIds];
        if (assigned.length > 0) {
          // Aislar solo los elementos coloreados/completados — el resto queda ghosteado pero CLICKEABLE
          viewer.isolate(assigned, viewer.model);
        } else if (strictIsolate) {
          // Modo Aislar activo sin elementos aún ejecutados → modelo en blanco
          // isolate([]) en Forge muestra TODO — usar [-1] para ocultar todo
          viewer.isolate([-1], viewer.model);
        } else {
          // Sin Aislar activo y sin asignados: mostrar todo el modelo
          viewer.showAll();
        }
      } else {
        viewer.showAll();
      }
    }

    viewer.clearThemingColors();
    for (const { externalId, hex, alpha } of (elementColors ?? [])) {
      const dbId = extIdToDbIdRef.current[externalId];
      if (dbId == null) continue;
      viewer.setThemingColor(dbId, hexToVec4(hex, alpha ?? 0.95), viewer.model, true);
    }

    // Ocultar elementos marcados por el usuario (sobrevive a isolate/showAll)
    const hiddenDbIds = hiddenIds
      .map(id => extIdToDbIdRef.current[id])
      .filter((id): id is number => id != null);
    if (hiddenDbIds.length > 0) viewer.hide(hiddenDbIds, viewer.model);

    viewer.impl?.invalidate(true);
  }, [elementColors, doneIds, globalGrey, nodeFilterIds, hiddenIds, strictIsolate]);

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
          window.Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT,
          () => {
            const tree = viewer.model?.getInstanceTree();
            if (!tree) return;
            instanceTreeRef.current = tree;
            if (!onModelTreeReady) return;

            // Recopilar hijos directos de un nodo dado
            const getChildren = (parentId: number): { id: number; name: string }[] => {
              const result: { id: number; name: string }[] = [];
              tree.enumNodeChildren(parentId, (childId: number) => {
                const name = tree.getNodeName(childId);
                if (name) result.push({ id: childId, name });
              }, false);
              return result;
            };

            // El árbol de Navisworks suele tener: Root → Carpeta ("Disciplina") → archivos.nwc/nwd
            // Si el primer nivel tiene pocos nodos (carpetas), bajamos un nivel más
            // para obtener los archivos reales.
            const rootId   = tree.getRootId();
            let nodes      = getChildren(rootId);

            // Si todos los hijos parecen carpetas (sin extensión) bajamos un nivel
            const areFolders = nodes.every(n => !n.name.includes('.'));
            if (areFolders && nodes.length > 0) {
              // Tomar los hijos de TODOS los nodos-carpeta del primer nivel
              const deep: { id: number; name: string }[] = [];
              nodes.forEach(folder => deep.push(...getChildren(folder.id)));
              if (deep.length > 0) nodes = deep;
            }

            if (nodes.length) onModelTreeReady(nodes);
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
  }, [sdkReady]);

  const loadModel = useCallback(async (viewer: any) => {
    // Unload any previously loaded models and reset mappings
    modelLoadedRef.current  = false;
    extIdToDbIdRef.current  = {};
    dbIdToExtIdRef.current  = {};
    try {
      const models = viewer.getAllModels?.() ?? [];
      models.forEach((m: any) => { try { viewer.unloadModel(m); } catch {} });
    } catch {}

    setStatus('Buscando modelo del proyecto…');
    setError('');
    setModelName('');
    try {
      const url = currentProject?.id
        ? `/api/aps/default-model?projectId=${currentProject.id}`
        : '/api/aps/default-model';
      const r = await fetch(url);
      if (!r.ok) { setError((await r.json()).error ?? 'Modelo no encontrado'); setStatus(''); return; }
      const { urn, name } = await r.json();
      setModelName(name);
      setStatus(`Cargando ${name}…`);
      window.Autodesk.Viewing.Document.load(
        `urn:${urn}`,
        (doc: any) => {
          viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry());
          onModelUrnReady?.(urn); // notify parent AFTER model starts loading
          setStatus('');
        },
        (code: number, msg: string) => { setError(`Error (${code}): ${msg}`); setStatus(''); }
      );
    } catch (e: any) { setError(`Error: ${e.message}`); setStatus(''); }
  }, [currentProject?.id, onModelUrnReady]);

  // Re-cargar modelo cuando cambia el proyecto
  useEffect(() => {
    if (viewerRef.current && currentProject?.id) {
      loadModel(viewerRef.current);
    }
  }, [currentProject?.id, loadModel]);

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
