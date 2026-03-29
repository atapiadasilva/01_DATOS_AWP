'use client';

/**
 * ProjectSetupWizard
 * Multi-step wizard to create or configure a project:
 *   Step 1 — Basic info (name, description)
 *   Step 2 — APS model assignment (paste URN or browse ACC)
 *   Step 3 — WBS column mapping (auto-detect or manual)
 *   Step 4 — Done
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Check, ChevronRight, ChevronLeft, X, Loader2,
  FolderOpen, Box, Table2, RefreshCw, AlertCircle,
  CheckCircle2, Settings, Link,
} from 'lucide-react';
import { useProject, type ProjectSettings } from '@/contexts/ProjectContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WizardProps {
  /** If provided, configure an existing project rather than create a new one */
  projectId?: string;
  onClose: () => void;
  onDone?: () => void;
}

interface AccNode {
  id: string;
  name: string;
  type: 'hub' | 'project' | 'folder' | 'folders' | 'items';
  hubId?: string;
  projectId?: string;
  extension?: string;
}

interface WbsPreviewRow {
  [col: string]: string;
}

const WBS_COLS = [
  { key: 'wbs_col_edt',            label: 'EDT / Código WBS',      required: true  },
  { key: 'wbs_col_name',           label: 'Nombre de tarea',        required: true  },
  { key: 'wbs_col_start',          label: 'Fecha inicio (real)',     required: true  },
  { key: 'wbs_col_end',            label: 'Fecha fin (real)',        required: true  },
  { key: 'wbs_col_baseline_start', label: 'Inicio de línea base',    required: false },
  { key: 'wbs_col_baseline_end',   label: 'Fin de línea base',       required: false },
  { key: 'wbs_col_progress',       label: '% de avance',            required: false },
  { key: 'wbs_col_duration',       label: 'Duración',               required: false },
  { key: 'wbs_col_discipline',     label: 'Disciplina',             required: false },
  { key: 'wbs_col_cwp',            label: 'CWP (si existe)',        required: false },
] as const;

const STEP_LABELS = ['Proyecto', 'Modelo 3D', 'Programa WBS', 'Listo'];

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectSetupWizard({ projectId, onClose, onDone }: WizardProps) {
  const { createProject, saveProjectSettings, projectSettings, currentProject, projects } = useProject();

  const isEdit   = Boolean(projectId);
  const [step, setStep] = useState(isEdit ? 1 : 0);

  // Step 0 — Basic info
  const [projName, setProjName]   = useState('');
  const [projDesc, setProjDesc]   = useState('');
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(projectId ?? null);

  // Step 1 — APS Model
  const [urnInput,    setUrnInput]    = useState('');
  const [modelName,   setModelName]   = useState('');
  const [browsing,    setBrowsing]    = useState(false);
  const [accNodes,    setAccNodes]    = useState<AccNode[]>([]);
  const [accPath,     setAccPath]     = useState<{ id: string; name: string; level: string; hubId?: string; projectId?: string }[]>([]);
  const [accLoading,  setAccLoading]  = useState(false);
  const [urnResolved, setUrnResolved] = useState(false);
  const [urnError,    setUrnError]    = useState('');

  // Step 2 — WBS
  const [wbsEntityName, setWbsEntityName] = useState('PROGRAMA DE OBRA ACTUALIZADO');
  const [wbsColumns,    setWbsColumns]    = useState<string[]>([]);
  const [wbsPreview,    setWbsPreview]    = useState<WbsPreviewRow[]>([]);
  const [wbsLoading,    setWbsLoading]    = useState(false);
  const [wbsMapping,    setWbsMapping]    = useState<Record<string, string>>({
    wbs_col_edt:             'EDT',
    wbs_col_name:            'Nombre de tarea',
    wbs_col_start:           'Comienzo Actual',
    wbs_col_end:             'Fin Actual',
    wbs_col_baseline_start:  'Comienzo de línea base1',
    wbs_col_baseline_end:    'Fin de línea base1',
    wbs_col_progress:        '% trabajo completado',
    wbs_col_duration:        'Duración',
    wbs_col_discipline:      'Disciplina',
    wbs_col_cwp:             '',
  });

  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  // Pre-fill when editing existing project
  useEffect(() => {
    if (!isEdit || !projectSettings) return;
    setUrnInput(projectSettings.aps_model_urn ?? '');
    setModelName(projectSettings.aps_model_name ?? '');
    setUrnResolved(Boolean(projectSettings.aps_model_urn));
    setWbsEntityName(projectSettings.wbs_entity_name);
    setWbsMapping({
      wbs_col_edt:             projectSettings.wbs_col_edt,
      wbs_col_name:            projectSettings.wbs_col_name,
      wbs_col_start:           projectSettings.wbs_col_start,
      wbs_col_end:             projectSettings.wbs_col_end,
      wbs_col_baseline_start:  projectSettings.wbs_col_baseline_start,
      wbs_col_baseline_end:    projectSettings.wbs_col_baseline_end,
      wbs_col_progress:        projectSettings.wbs_col_progress,
      wbs_col_duration:        projectSettings.wbs_col_duration,
      wbs_col_discipline:      projectSettings.wbs_col_discipline,
      wbs_col_cwp:             projectSettings.wbs_col_cwp ?? '',
    });
  }, [isEdit, projectSettings]);

  // ── Step 0 handlers ──────────────────────────────────────────────────────

  const handleCreateProject = async () => {
    if (!projName.trim()) { setError('Ingresa un nombre para el proyecto'); return; }
    setSaving(true); setError('');
    const proj = await createProject(projName.trim(), projDesc.trim());
    setSaving(false);
    if (!proj) { setError('Error al crear el proyecto'); return; }
    setCreatedProjectId(proj.id);
    setStep(1);
  };

  // ── Step 1 — ACC browse (hierarchical: hubs → projects → folders → contents) ─

  const accLoad = async (url: string): Promise<any[]> => {
    try {
      const r = await fetch(url);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error');
      return Array.isArray(d) ? d : (d.items ?? []);
    } catch { return []; }
  };

  const browseAccRoot = async () => {
    setBrowsing(true);
    setAccLoading(true);
    setAccPath([]);
    const hubs = await accLoad('/api/aps/tree?type=hubs');
    setAccNodes(hubs.map((h: any) => ({ id: h.id, name: h.name, type: 'hub' as const })));
    setAccLoading(false);
  };

  const accNavigate = async (node: AccNode) => {
    setAccLoading(true);
    let nextNodes: AccNode[] = [];

    if (node.type === 'hub') {
      const projects = await accLoad(`/api/aps/tree?type=projects&hubId=${encodeURIComponent(node.id)}`);
      nextNodes = projects.map((p: any) => ({ id: p.id, name: p.name, type: 'project' as const, hubId: node.id }));
      setAccPath(prev => [...prev, { id: node.id, name: node.name, level: 'hub' }]);

    } else if (node.type === 'project') {
      const folders = await accLoad(
        `/api/aps/tree?type=folders&hubId=${encodeURIComponent(node.hubId!)}&projectId=${encodeURIComponent(node.id)}`
      );
      nextNodes = folders.map((f: any) => ({ id: f.id, name: f.name, type: 'folder' as const, hubId: node.hubId, projectId: node.id }));
      setAccPath(prev => [...prev, { id: node.id, name: node.name, level: 'project', hubId: node.hubId }]);

    } else if (node.type === 'folder' || node.type === 'folders') {
      const pid = node.projectId ?? accPath.find(p => p.level === 'project')?.id ?? '';
      const contents = await accLoad(
        `/api/aps/tree?type=contents&projectId=${encodeURIComponent(pid)}&folderId=${encodeURIComponent(node.id)}`
      );
      nextNodes = contents.map((c: any) => ({
        id: c.id, name: c.name,
        type: c.type as 'folders' | 'items',
        projectId: pid,
        hubId: node.hubId,
        extension: c.extension,
      }));
      setAccPath(prev => [...prev, { id: node.id, name: node.name, level: 'folder', projectId: pid, hubId: node.hubId }]);

    } else if (node.type === 'items') {
      // File selected — resolve URN
      const pid = node.projectId ?? accPath.find(p => p.level === 'project')?.id ?? '';
      const r = await fetch(`/api/aps/tree?type=urn&projectId=${encodeURIComponent(pid)}&itemId=${encodeURIComponent(node.id)}`);
      const d = await r.json();
      if (d.urn) {
        setUrnInput(d.urn);
        setModelName(node.name);
        setUrnResolved(true);
        setUrnError('');
      } else {
        setUrnError('No se pudo obtener el URN de este archivo. Verifica que esté traducido en APS.');
      }
      setBrowsing(false);
      setAccLoading(false);
      return;
    }

    setAccNodes(nextNodes);
    setAccLoading(false);
  };

  const accGoBack = async () => {
    const newPath = accPath.slice(0, -1);
    setAccPath(newPath);
    setAccLoading(true);
    const prev = newPath[newPath.length - 1];
    let nodes: AccNode[] = [];
    if (!prev) {
      // Back to hubs
      const hubs = await accLoad('/api/aps/tree?type=hubs');
      nodes = hubs.map((h: any) => ({ id: h.id, name: h.name, type: 'hub' as const }));
    } else if (prev.level === 'hub') {
      const projects = await accLoad(`/api/aps/tree?type=projects&hubId=${encodeURIComponent(prev.id)}`);
      nodes = projects.map((p: any) => ({ id: p.id, name: p.name, type: 'project' as const, hubId: prev.id }));
    } else if (prev.level === 'project') {
      const folders = await accLoad(
        `/api/aps/tree?type=folders&hubId=${encodeURIComponent(prev.hubId!)}&projectId=${encodeURIComponent(prev.id)}`
      );
      nodes = folders.map((f: any) => ({ id: f.id, name: f.name, type: 'folder' as const, hubId: prev.hubId, projectId: prev.id }));
    } else if (prev.level === 'folder') {
      const contents = await accLoad(
        `/api/aps/tree?type=contents&projectId=${encodeURIComponent(prev.projectId!)}&folderId=${encodeURIComponent(prev.id)}`
      );
      nodes = contents.map((c: any) => ({
        id: c.id, name: c.name, type: c.type, projectId: prev.projectId, hubId: prev.hubId, extension: c.extension,
      }));
    }
    setAccNodes(nodes);
    setAccLoading(false);
  };

  // Extract URN from an ACC viewer URL or plain URN paste
  const tryExtractUrn = (raw: string): { urn: string | null; hint: string } => {
    const trimmed = raw.trim();
    if (!trimmed) return { urn: null, hint: '' };

    // Already a base64 URN (no spaces, no colon at start)
    if (!trimmed.startsWith('http') && !trimmed.startsWith('urn:')) {
      return { urn: trimmed, hint: '' };
    }

    // Full urn:adsk... string → base64 encode it
    if (trimmed.startsWith('urn:adsk')) {
      const b64 = Buffer.from(trimmed).toString('base64').replace(/=/g, '');
      return { urn: b64, hint: `URN convertido a base64` };
    }

    // ACC viewer URL: https://acc.autodesk.com/viewer?urn=...
    try {
      const url = new URL(trimmed);
      const urnParam = url.searchParams.get('urn');
      if (urnParam) return { urn: urnParam, hint: 'URN extraído de la URL del visor' };

      // ACC docs URL may contain urn in path after /items/
      const pathMatch = url.pathname.match(/\/items\/(urn:[^/]+)/);
      if (pathMatch) {
        const b64 = Buffer.from(decodeURIComponent(pathMatch[1])).toString('base64').replace(/=/g, '');
        return { urn: b64, hint: 'URN extraído del link de ACC' };
      }
    } catch {}

    return { urn: null, hint: 'No se pudo extraer el URN de este link. Usa el explorador ACC o pega el URN directamente.' };
  };

  const resolveUrnManually = () => {
    setUrnError('');
    if (!urnInput.trim()) { setUrnError('Pega el URN o link del modelo'); return; }
    const { urn, hint } = tryExtractUrn(urnInput);
    if (!urn) { setUrnError(hint || 'Formato no reconocido'); return; }
    if (urn !== urnInput.trim()) setUrnInput(urn);
    setModelName(modelName || 'Modelo personalizado');
    setUrnResolved(true);
    if (hint) setUrnError('');
  };

  // ── Step 2 — WBS preview ──────────────────────────────────────────────────

  const loadWbsPreview = useCallback(async () => {
    const pid = createdProjectId || projectId;
    if (!pid) return;
    setWbsLoading(true);
    try {
      const r = await fetch(`/api/aps/wbs?projectId=${pid}&entityName=${encodeURIComponent(wbsEntityName)}`);
      if (!r.ok) { setWbsColumns([]); setWbsPreview([]); setWbsLoading(false); return; }
      const d = await r.json();

      // Get raw records to extract column names
      const colRes = await fetch(
        `/api/project-settings/wbs-columns?projectId=${pid}&entityName=${encodeURIComponent(wbsEntityName)}`
      );
      if (colRes.ok) {
        const colData = await colRes.json();
        setWbsColumns(colData.columns ?? []);
        setWbsPreview(colData.preview ?? []);
        // Auto-detect column mapping
        if (colData.columns?.length) autoDetectColumns(colData.columns);
      } else if (d.tasks?.length) {
        // Fallback: use task keys as column hints
        const firstTask = d.tasks[0];
        setWbsColumns(Object.keys(firstTask));
      }
    } finally {
      setWbsLoading(false);
    }
  }, [createdProjectId, projectId, wbsEntityName]);

  useEffect(() => { if (step === 2) loadWbsPreview(); }, [step, loadWbsPreview]);

  const autoDetectColumns = (cols: string[]) => {
    const lower = cols.map(c => c.toLowerCase());
    const match = (patterns: string[]): string => {
      for (const p of patterns) {
        const idx = lower.findIndex(c => c.includes(p));
        if (idx >= 0) return cols[idx];
      }
      return '';
    };
    setWbsMapping(prev => ({
      ...prev,
      wbs_col_edt:            match(['edt', 'wbs code', 'código', 'id tarea'])   || prev.wbs_col_edt,
      wbs_col_name:           match(['nombre', 'tarea', 'task name', 'name'])      || prev.wbs_col_name,
      wbs_col_start:          match(['comienzo actual', 'inicio actual', 'start']) || prev.wbs_col_start,
      wbs_col_end:            match(['fin actual', 'end actual', 'finish'])         || prev.wbs_col_end,
      wbs_col_baseline_start: match(['línea base', 'baseline start'])              || prev.wbs_col_baseline_start,
      wbs_col_baseline_end:   match(['línea base', 'baseline end', 'finish base']) || prev.wbs_col_baseline_end,
      wbs_col_progress:       match(['trabajo completado', 'avance', 'progress', '%']) || prev.wbs_col_progress,
      wbs_col_duration:       match(['duración', 'duration'])                       || prev.wbs_col_duration,
      wbs_col_discipline:     match(['disciplina', 'discipline'])                   || prev.wbs_col_discipline,
      wbs_col_cwp:            match(['cwp', 'paquete', 'package'])                  || prev.wbs_col_cwp,
    }));
  };

  // ── Final save ────────────────────────────────────────────────────────────

  const handleSaveAll = async () => {
    setSaving(true); setError('');
    const fields: Partial<ProjectSettings> = {
      aps_model_urn:          urnInput.trim() || null,
      aps_model_name:         modelName.trim() || null,
      wbs_entity_name:        wbsEntityName,
      wbs_col_edt:            wbsMapping.wbs_col_edt,
      wbs_col_name:           wbsMapping.wbs_col_name,
      wbs_col_start:          wbsMapping.wbs_col_start,
      wbs_col_end:            wbsMapping.wbs_col_end,
      wbs_col_baseline_start: wbsMapping.wbs_col_baseline_start,
      wbs_col_baseline_end:   wbsMapping.wbs_col_baseline_end,
      wbs_col_progress:       wbsMapping.wbs_col_progress,
      wbs_col_duration:       wbsMapping.wbs_col_duration,
      wbs_col_discipline:     wbsMapping.wbs_col_discipline,
      wbs_col_cwp:            wbsMapping.wbs_col_cwp || null,
      setup_completed:        true,
      setup_step:             3,
    } as any;

    const result = await saveProjectSettings(fields as any);
    setSaving(false);
    if (!result) { setError('Error al guardar la configuración'); return; }
    setStep(3);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-500" />
            <span className="font-bold text-slate-800 text-base">
              {isEdit ? 'Configurar proyecto' : 'Nuevo proyecto'}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step progress */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-slate-100 shrink-0 bg-slate-50">
          {STEP_LABELS.map((label, i) => {
            const startIdx = isEdit ? 1 : 0;
            const activeStep = step;
            const absI = isEdit ? i + 1 : i;
            const done = absI < activeStep;
            const active = absI === activeStep;
            if (isEdit && i === 0) return null;
            return (
              <React.Fragment key={i}>
                {i > (isEdit ? 1 : 0) && <div className="flex-1 h-px bg-slate-200" />}
                <div className={`flex items-center gap-1.5 text-[11px] font-semibold shrink-0
                  ${active ? 'text-blue-600' : done ? 'text-emerald-600' : 'text-slate-400'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] border-2
                    ${active ? 'border-blue-500 bg-blue-500 text-white' :
                      done   ? 'border-emerald-500 bg-emerald-500 text-white' :
                               'border-slate-300 text-slate-400'}`}>
                    {done ? <Check className="w-3 h-3" /> : (isEdit ? i : i + 1)}
                  </span>
                  {label}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Step 0: Project name ── */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-600 mb-4">
                  Crea un nuevo proyecto. Después podrás asignarle un modelo 3D y configurar el mapeo del programa WBS.
                </p>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nombre del proyecto <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={projName}
                  onChange={e => setProjName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
                  placeholder="Ej: Proyecto Andina Fase 2"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Descripción (opcional)</label>
                <textarea
                  value={projDesc}
                  onChange={e => setProjDesc(e.target.value)}
                  placeholder="Descripción breve del proyecto..."
                  rows={2}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
          )}

          {/* ── Step 1: APS Model ── */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Asigna el modelo 3D de ACC/BIM360 que se usará como visor para este proyecto.
                Puedes pegar el URN directamente o navegar tu cuenta de ACC.
              </p>

              {/* Paste URN or ACC URL */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Opción A — Pegar URN o link de ACC</p>
                <p className="text-[11px] text-slate-500">
                  Puedes pegar el <strong>URN base64</strong> directamente, o el <strong>link del visor de ACC</strong>
                  {' '}(la URL que ves en el navegador cuando abres el modelo).
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={urnInput}
                    onChange={e => { setUrnInput(e.target.value); setUrnResolved(false); setUrnError(''); }}
                    placeholder="dXJuOmFkc2su…  ó  https://acc.autodesk.com/viewer?urn=…"
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={resolveUrnManually}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded-lg font-semibold transition-colors whitespace-nowrap">
                    Usar
                  </button>
                </div>
                {urnError && (
                  <div className="flex items-start gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {urnError}
                  </div>
                )}
                {urnResolved && urnInput && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>URN configurado correctamente</span>
                    </div>
                    <input
                      value={modelName}
                      onChange={e => setModelName(e.target.value)}
                      placeholder="Nombre del modelo (para mostrar en la app)"
                      className="w-full border border-emerald-300 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                    <p className="text-[10px] text-slate-400 font-mono truncate">URN: {urnInput.slice(0, 60)}…</p>
                  </div>
                )}
              </div>

              {/* Browse ACC — hierarchical */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Opción B — Navegar ACC</p>
                  <button
                    onClick={browseAccRoot}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-blue-500 hover:bg-blue-400 text-white transition-colors">
                    <FolderOpen className="w-3.5 h-3.5" />
                    {browsing ? 'Reiniciar' : 'Abrir explorador'}
                  </button>
                </div>

                {browsing && (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 border-b border-slate-200 text-[10px] text-slate-500 flex-wrap">
                      <button onClick={browseAccRoot} className="hover:text-blue-600 transition-colors font-medium">Inicio</button>
                      {accPath.map((p, i) => (
                        <React.Fragment key={p.id}>
                          <ChevronRight className="w-3 h-3 shrink-0" />
                          <span className={i === accPath.length - 1
                            ? 'text-slate-800 font-semibold truncate max-w-[120px]'
                            : 'hover:text-blue-600 cursor-pointer transition-colors truncate max-w-[120px]'}>
                            {p.name}
                          </span>
                        </React.Fragment>
                      ))}
                      {accPath.length > 0 && (
                        <button onClick={accGoBack} className="ml-auto text-[10px] text-slate-400 hover:text-blue-600 transition-colors flex items-center gap-0.5">
                          <ChevronLeft className="w-3 h-3" /> Atrás
                        </button>
                      )}
                    </div>
                    {/* Node list */}
                    <div className="max-h-52 overflow-y-auto">
                      {accLoading ? (
                        <div className="flex items-center justify-center py-6 text-slate-400 gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
                        </div>
                      ) : accNodes.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400">Sin contenido</div>
                      ) : (
                        accNodes.map(node => {
                          const isFile = node.type === 'items';
                          const isFolder = !isFile;
                          return (
                            <button
                              key={node.id}
                              onClick={() => accNavigate(node)}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0">
                              {isFile
                                ? <Box className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                : <FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                              <span className="flex-1 truncate">{node.name}</span>
                              {node.extension && <span className="text-[9px] text-slate-400 uppercase font-bold shrink-0">{node.extension}</span>}
                              {isFolder && <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
                {urnError && browsing && (
                  <div className="flex items-start gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {urnError}
                  </div>
                )}
              </div>

              {/* Skip option */}
              <p className="text-xs text-slate-400 text-center">
                Puedes configurar el modelo más tarde desde Ajustes del proyecto.
              </p>
            </div>
          )}

          {/* ── Step 2: WBS columns ── */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Indica qué columnas de tu archivo de programa/WBS corresponden a cada campo. El sistema
                usará esta configuración para leer el cronograma correctamente.
              </p>

              {/* Entity name */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nombre del archivo/entidad WBS
                  </label>
                  <input
                    value={wbsEntityName}
                    onChange={e => setWbsEntityName(e.target.value)}
                    placeholder="PROGRAMA DE OBRA ACTUALIZADO"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Nombre exacto tal como fue cargado en la pestaña "Cargar datos".
                  </p>
                </div>
                <button
                  onClick={loadWbsPreview}
                  disabled={wbsLoading}
                  className="flex items-center gap-1 text-xs px-3 py-2 rounded-lg border border-slate-300 hover:border-blue-400 hover:text-blue-600 transition-colors shrink-0 mt-4">
                  {wbsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Detectar
                </button>
              </div>

              {/* Column mappings */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                  <Table2 className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-700">Mapeo de columnas</span>
                  {wbsColumns.length > 0 && (
                    <span className="ml-auto text-[10px] text-emerald-600 font-semibold">
                      {wbsColumns.length} columnas detectadas
                    </span>
                  )}
                </div>

                <div className="divide-y divide-slate-100">
                  {WBS_COLS.map(({ key, label, required }) => (
                    <div key={key} className="flex items-center gap-3 px-3 py-2">
                      <div className="w-40 shrink-0">
                        <span className="text-[11px] font-semibold text-slate-700">{label}</span>
                        {required && <span className="text-red-400 ml-0.5 text-[10px]">*</span>}
                      </div>
                      {wbsColumns.length > 0 ? (
                        <select
                          value={wbsMapping[key] ?? ''}
                          onChange={e => setWbsMapping(p => ({ ...p, [key]: e.target.value }))}
                          className="flex-1 border border-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                          <option value="">— Sin asignar —</option>
                          {wbsColumns.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={wbsMapping[key] ?? ''}
                          onChange={e => setWbsMapping(p => ({ ...p, [key]: e.target.value }))}
                          placeholder={`Nombre de columna…`}
                          className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview table */}
              {wbsPreview.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
                    <span className="text-xs font-bold text-slate-700">Vista previa (primeras 3 filas)</span>
                  </div>
                  <div className="overflow-x-auto max-h-32">
                    <table className="text-[10px] w-full">
                      <thead className="bg-slate-100">
                        <tr>
                          {wbsColumns.slice(0, 6).map(col => (
                            <th key={col} className="px-2 py-1 text-left font-semibold text-slate-600 border-r border-slate-200 last:border-0 truncate max-w-[120px]">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {wbsPreview.slice(0, 3).map((row, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            {wbsColumns.slice(0, 6).map(col => (
                              <td key={col} className="px-2 py-1 text-slate-700 border-r border-slate-100 last:border-0 truncate max-w-[120px]">
                                {String(row[col] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Done ── */}
          {step === 3 && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-slate-800 mb-1">¡Proyecto configurado!</p>
                <p className="text-sm text-slate-500">
                  El modelo 3D y el programa WBS están listos. Puedes comenzar a trabajar.
                </p>
              </div>
              <div className="w-full max-w-xs bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-slate-600">
                  <Box className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="truncate">{modelName || (urnInput ? 'Modelo asignado' : 'Sin modelo (asignar luego)')}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Table2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="truncate">WBS: {wbsEntityName}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Columnas mapeadas ({WBS_COLS.filter(c => wbsMapping[c.key]).length}/{WBS_COLS.length})</span>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-3 flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 shrink-0 bg-slate-50">
          <div>
            {step > (isEdit ? 1 : 0) && step < 3 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors">
                <ChevronLeft className="w-4 h-4" /> Atrás
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step === 3 ? (
              <button
                onClick={() => { onDone?.(); onClose(); }}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold rounded-xl transition-colors">
                Ir al proyecto
              </button>
            ) : step === 2 ? (
              <>
                <button
                  onClick={() => setStep(3)}
                  className="text-sm text-slate-400 hover:text-slate-600 px-3 py-2 transition-colors">
                  Omitir
                </button>
                <button
                  onClick={handleSaveAll}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Guardar y finalizar
                </button>
              </>
            ) : step === 1 ? (
              <>
                <button
                  onClick={() => setStep(2)}
                  className="text-sm text-slate-400 hover:text-slate-600 px-3 py-2 transition-colors">
                  Omitir
                </button>
                <button
                  onClick={async () => {
                    if (urnInput.trim()) {
                      setSaving(true);
                      await saveProjectSettings({
                        aps_model_urn:  urnInput.trim(),
                        aps_model_name: modelName.trim() || 'Modelo',
                        setup_step: 2,
                      } as any);
                      setSaving(false);
                    }
                    setStep(2);
                  }}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Siguiente <ChevronRight className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={handleCreateProject}
                disabled={saving || !projName.trim()}
                className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Crear proyecto <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
