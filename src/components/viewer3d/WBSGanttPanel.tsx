'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown,
  Link2, Link2Off, Loader2, Calendar, ChevronUp,
} from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';

interface WBSTask {
  edt:         string;
  name:        string;
  level:       number;
  start:       string | null;
  end:         string | null;
  baseStart:   string | null;
  baseEnd:     string | null;
  progress:    number;
  duration:    string;
  discipline:  string;
  hasChildren: boolean;
}

interface Props {
  modelUrn:            string;
  viewerSelection:     string[];
  onHighlightElements: (ids: string[]) => void;
  minimized:           boolean;
  onToggleMinimize:    () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────
const PX_PER_DAY = 5;
const ROW_H      = 28;

// Color per top-level group (1.x)
const GROUP_COLORS: Record<string, string> = {
  '1.1':  '#64748b', // HITOS — slate
  '1.2':  '#3b82f6', // INGENIERÍA APC — blue
  '1.3':  '#60a5fa', // INGENIERÍA PENDIENTE — light blue
  '1.4':  '#f59e0b', // SUMINISTROS DAND — amber
  '1.5':  '#fbbf24', // SUMINISTROS ANDINA — yellow
  '1.6':  '#a78bfa', // — violet
  '1.7':  '#34d399', // — emerald
  '1.8':  '#fb923c', // GESTIÓN — orange
  '1.9':  '#22c55e', // CONSTRUCCIÓN Y MONTAJE — green
  '1.10': '#ef4444', // PRUEBAS — red
};

function taskColor(edt: string): string {
  const group = edt.split('.').slice(0, 2).join('.');
  return GROUP_COLORS[group] ?? '#94a3b8';
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// ── Component ──────────────────────────────────────────────────────────────
export default function WBSGanttPanel({
  modelUrn, viewerSelection, onHighlightElements,
  minimized, onToggleMinimize,
}: Props) {
  const { currentProject } = useProject();

  const [tasks,     setTasks]     = useState<WBSTask[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [activeEdt, setActiveEdt] = useState<string | null>(null);
  const [wbsLinks,  setWbsLinks]  = useState<Record<string, string[]>>({});
  const [saving,    setSaving]    = useState(false);

  // Synced scroll refs
  const leftRef   = useRef<HTMLDivElement>(null);
  const rightRef  = useRef<HTMLDivElement>(null);
  const syncGuard = useRef(false);

  const onLeftScroll  = (e: React.UIEvent<HTMLDivElement>) => {
    if (syncGuard.current) return;
    syncGuard.current = true;
    if (rightRef.current) rightRef.current.scrollTop = (e.target as HTMLDivElement).scrollTop;
    syncGuard.current = false;
  };
  const onRightScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (syncGuard.current) return;
    syncGuard.current = true;
    if (leftRef.current) leftRef.current.scrollTop = (e.target as HTMLDivElement).scrollTop;
    syncGuard.current = false;
  };

  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  // ── Load tasks ────────────────────────────────────────────────────────────
  useEffect(() => {
    const url = currentProject?.id ? `/api/aps/wbs?projectId=${currentProject.id}` : '/api/aps/wbs';
    console.log('[WBS] Loading tasks from:', url);
    setLoading(true);
    fetch(url)
      .then(r => r.json())
      .then((data: any) => {
        console.log('[WBS] Data received:', data);
        const taskList = Array.isArray(data) ? data : (data.tasks || []);
        setTasks(taskList);
        if (data.debug) setDebugInfo(data.debug);
        
        // Default: collapse from level 3 down
        const c: Record<string, boolean> = {};
        taskList.forEach((t: WBSTask) => { if (t.hasChildren && t.level >= 3) c[t.edt] = true; });
        setCollapsed(c);
      })
      .catch(err => {
        console.error('[WBS] Fetch error:', err);
      })
      .finally(() => setLoading(false));
  }, [currentProject?.id]);

  // ── Load WBS links ────────────────────────────────────────────────────────
  const loadLinks = useCallback(() => {
    if (!currentProject?.id || !modelUrn) return;
    fetch(`/api/aps/wbs-links?projectId=${currentProject.id}&modelUrn=${encodeURIComponent(modelUrn)}`)
      .then(r => r.json())
      .then((data: { external_id: string; wbs_id: string }[]) => {
        if (!Array.isArray(data)) return;
        const map: Record<string, string[]> = {};
        data.forEach(l => { (map[l.wbs_id] ??= []).push(l.external_id); });
        setWbsLinks(map);
      });
  }, [currentProject?.id, modelUrn]);

  useEffect(() => { loadLinks(); }, [loadLinks]);

  // ── Visible tasks ─────────────────────────────────────────────────────────
  const visibleTasks = useMemo(() => tasks.filter(t => {
    const parts = t.edt.split('.');
    for (let i = 1; i < parts.length; i++) {
      if (collapsed[parts.slice(0, i).join('.')]) return false;
    }
    return true;
  }), [tasks, collapsed]);

  // ── Gantt geometry ────────────────────────────────────────────────────────
  const { projStart, totalPx, months, todayPx } = useMemo(() => {
    const ts = tasks.flatMap(t => [t.start, t.end]).filter(Boolean).map(s => new Date(s!).getTime());
    if (!ts.length) return { projStart: new Date(), totalPx: 800, months: [], todayPx: 0 };

    const psRaw = new Date(Math.min(...ts));
    psRaw.setDate(1);                             // snap to month start
    const projStart = psRaw;
    const projEnd   = new Date(Math.max(...ts));

    const totalDays = daysBetween(projStart, projEnd) + 10;
    const totalPx   = totalDays * PX_PER_DAY;

    const months: { label: string; leftPx: number; widthPx: number; alt: boolean }[] = [];
    let d = new Date(projStart);
    let idx = 0;
    while (d <= projEnd) {
      const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      months.push({
        label:   d.toLocaleDateString('es', { month: 'short', year: '2-digit' }),
        leftPx:  Math.max(0, daysBetween(projStart, d)) * PX_PER_DAY,
        widthPx: dim * PX_PER_DAY,
        alt:     idx % 2 === 1,
      });
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      idx++;
    }

    const todayPx = Math.max(0, daysBetween(projStart, new Date())) * PX_PER_DAY;
    return { projStart, totalPx, months, todayPx };
  }, [tasks]);

  const getBar = (task: WBSTask) => {
    if (!task.start || !task.end) return null;
    const s  = new Date(task.start);
    const e  = new Date(task.end);
    const lx = Math.max(0, daysBetween(projStart, s)) * PX_PER_DAY;
    const wx = Math.max(daysBetween(s, e) * PX_PER_DAY, 3);
    return { lx, wx };
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const toggleCollapse = (edt: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed(p => ({ ...p, [edt]: !p[edt] }));
  };
  const expandAll  = () => setCollapsed({});
  const collapseAll = () => {
    const c: Record<string, boolean> = {};
    tasks.forEach(t => { if (t.hasChildren) c[t.edt] = true; });
    setCollapsed(c);
  };

  const handleTaskClick = (task: WBSTask) => {
    const next = activeEdt === task.edt ? null : task.edt;
    setActiveEdt(next);
    if (next) {
      const linked = wbsLinks[next] ?? [];
      if (linked.length) onHighlightElements(linked);
    }
  };

  const handleAssign = async () => {
    if (!activeEdt || !viewerSelection.length || !currentProject?.id || !modelUrn) return;
    const activeTask = tasks.find(t => t.edt === activeEdt);
    setSaving(true);
    try {
      const r = await fetch('/api/aps/wbs-links', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          projectId:   currentProject.id,
          modelUrn,
          wbsId:       activeEdt,
          taskName:    activeTask?.name ?? '',
          externalIds: viewerSelection,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      loadLinks();
    } catch (e: any) {
      console.error('[WBS assign]', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async () => {
    if (!activeEdt || !currentProject?.id || !modelUrn) return;
    const toRemove = wbsLinks[activeEdt] ?? [];
    if (!toRemove.length) return;
    setSaving(true);
    try {
      await fetch('/api/aps/wbs-links', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId: currentProject.id, modelUrn, externalIds: toRemove }),
      });
      loadLinks();
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 bg-white overflow-hidden min-h-0">

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2 px-3 bg-slate-800 text-white"
        style={{ height: 36 }}>
        <Calendar className="w-3.5 h-3.5 text-blue-300 shrink-0" />
        <span className="text-[11px] font-black uppercase tracking-widest text-slate-200">
          Programa de Obra
        </span>

        {!minimized && (
          <>
            <div className="w-px h-4 bg-slate-600 mx-1" />
            <button onClick={expandAll} title="Expandir todo"
              className="text-slate-400 hover:text-white transition-colors">
              <ChevronsDownUp className="w-3.5 h-3.5" />
            </button>
            <button onClick={collapseAll} title="Colapsar todo"
              className="text-slate-400 hover:text-white transition-colors">
              <ChevronsUpDown className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        <div className="flex-1" />

        {/* Active task + assign controls */}
        {!minimized && activeEdt && (
          <>
            <span className="text-[10px] text-blue-300 truncate max-w-[180px] hidden lg:block">
              {tasks.find(t => t.edt === activeEdt)?.name.slice(0, 45)}
            </span>
            {viewerSelection.length > 0 && (
              <button onClick={handleAssign} disabled={saving}
                className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded
                  bg-blue-500 hover:bg-blue-400 disabled:opacity-40 transition-colors shrink-0">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                Vincular {viewerSelection.length}
              </button>
            )}
            {(wbsLinks[activeEdt]?.length ?? 0) > 0 && (
              <button onClick={handleUnlink} disabled={saving}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded
                  border border-red-500/40 text-red-300 hover:bg-red-500/20 disabled:opacity-40 transition-colors shrink-0">
                <Link2Off className="w-3 h-3" />
                Desvincular
              </button>
            )}
          </>
        )}

        {/* Minimize / expand */}
        <button onClick={onToggleMinimize}
          title={minimized ? 'Expandir programa' : 'Minimizar programa'}
          className="ml-2 text-slate-400 hover:text-white transition-colors shrink-0">
          {minimized
            ? <ChevronUp   className="w-4 h-4" />
            : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* ── Content (hidden when minimized) ──────────────────────────────────── */}
      {!minimized && (
        <>
          {loading ? (
            <div className="flex-1 flex items-center justify-center gap-2 text-slate-400 text-sm bg-white">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando programa…
            </div>
          ) : (
            <div className="flex flex-1 overflow-hidden min-h-0">
              {tasks.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-white">
                  <Calendar className="w-12 h-12 text-slate-100 mb-4" />
                  <h3 className="text-lg font-black text-slate-400 uppercase italic">Sin Programa de Obra</h3>
                  <p className="text-xs text-slate-400 max-w-xs mt-2 font-bold italic">
                    No se encontraron registros para la entidad <br/>
                    <span className="text-slate-500 uppercase">"PROGRAMA DE OBRA ACTUALIZADO"</span>
                  </p>
                  {debugInfo.length > 0 && (
                    <div className="mt-4 p-2 bg-slate-50 border border-slate-200 rounded text-[9px] font-mono text-slate-500 text-left max-w-md overflow-x-auto">
                      <div className="font-black mb-1 border-b border-slate-100 pb-1 uppercase tracking-tighter">Debug Status:</div>
                      {debugInfo.map((line, i) => <div key={i}>• {line}</div>)}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* ── Left: task tree (fixed 440px, vertical scroll) ────────────── */}
                  <div className="flex flex-col shrink-0 border-r border-slate-200 bg-white"
                    style={{ width: 440 }}>

                    {/* Column headers */}
                    <div className="shrink-0 flex items-stretch bg-slate-700 text-slate-300
                      text-[9px] font-black uppercase tracking-wider select-none border-b border-slate-600">
                      <div className="flex items-center px-2 py-2 border-r border-slate-600"
                        style={{ width: 110 }}>EDT</div>
                      <div className="flex items-center flex-1 px-2 py-2 border-r border-slate-600">
                        Nombre de Tarea
                      </div>
                      <div className="flex items-center justify-center px-1 py-2 border-r border-slate-600"
                        style={{ width: 38 }}>%</div>
                      <div className="flex items-center justify-center px-1 py-2"
                        style={{ width: 44 }}>3D</div>
                    </div>

                    {/* Rows */}
                    <div ref={leftRef} className="flex-1 overflow-y-auto" onScroll={onLeftScroll}>
                      {visibleTasks.map((task, idx) => {
                        const isActive  = activeEdt === task.edt;
                        const linkCount = (wbsLinks[task.edt] ?? []).length;
                        const color     = taskColor(task.edt);

                        return (
                          <div
                            key={task.edt}
                            onClick={() => handleTaskClick(task)}
                            style={{ height: ROW_H }}
                            className={`flex items-center border-b cursor-pointer select-none transition-colors
                              ${isActive
                                ? 'bg-blue-50 border-blue-100'
                                : idx % 2 === 0
                                  ? 'bg-white border-slate-50 hover:bg-slate-50'
                                  : 'bg-slate-50/50 border-slate-100 hover:bg-slate-100/60'}`}
                          >
                            {/* EDT + toggle */}
                            <div className="shrink-0 flex items-center gap-0.5 border-r border-slate-100"
                              style={{ width: 110, paddingLeft: 4 + task.level * 10 }}>
                              {task.hasChildren ? (
                                <button onClick={e => toggleCollapse(task.edt, e)}
                                  className="w-4 h-4 flex items-center justify-center shrink-0 text-slate-400 hover:text-slate-700">
                                  {collapsed[task.edt]
                                    ? <ChevronRight className="w-3 h-3" />
                                    : <ChevronDown  className="w-3 h-3" />}
                                </button>
                              ) : (
                                <span className="w-4 shrink-0" />
                              )}
                              {/* Color dot */}
                              <span className="w-2 h-2 rounded-sm shrink-0 mr-0.5"
                                style={{ background: color, opacity: 0.8 }} />
                              <span className={`text-[8.5px] font-mono truncate leading-none
                                ${isActive ? 'text-blue-700 font-bold' : 'text-slate-400'}`}>
                                {task.edt}
                              </span>
                            </div>

                            {/* Task name */}
                            <div className="flex-1 min-w-0 px-2 border-r border-slate-100">
                              <span className={`block truncate leading-tight
                                ${isActive
                                  ? 'text-[10.5px] font-bold text-blue-800'
                                  : task.level === 0
                                    ? 'text-[10.5px] font-extrabold text-slate-800'
                                    : task.level <= 2
                                      ? 'text-[10px] font-semibold text-slate-700'
                                      : 'text-[10px] font-normal text-slate-600'}`}>
                                {task.name}
                              </span>
                            </div>

                            {/* % */}
                            <div className="shrink-0 flex flex-col items-center justify-center gap-0.5 px-1 border-r border-slate-100"
                              style={{ width: 38 }}>
                              <span className={`text-[9px] font-black leading-none
                                ${task.progress === 100 ? 'text-green-600' : task.progress > 0 ? 'text-blue-600' : 'text-slate-300'}`}>
                                {task.progress}%
                              </span>
                              {/* Mini progress track */}
                              <div className="w-full h-1 rounded-full bg-slate-100 overflow-hidden" style={{ maxWidth: 28 }}>
                                <div className="h-full rounded-full" style={{ width: `${task.progress}%`, background: color }} />
                              </div>
                            </div>

                            {/* 3D link count */}
                            <div className="shrink-0 flex items-center justify-center" style={{ width: 44 }}>
                              {linkCount > 0 ? (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full text-white"
                                  style={{ background: color }}>
                                  {linkCount}
                                </span>
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Right: Gantt timeline (scrollable both axes) ──────────────── */}
                  <div
                    ref={rightRef}
                    className="flex-1 overflow-auto"
                    onScroll={onRightScroll}
                  >
                    <div style={{ width: totalPx, position: 'relative', minHeight: '100%' }}>

                      {/* Month header — sticky top, scrolls horizontally with content */}
                      <div className="sticky top-0 z-20 bg-slate-700 border-b border-slate-600"
                        style={{ height: 26 }}>
                        {months.map(m => (
                          <div key={m.label}
                            style={{ position: 'absolute', left: m.leftPx, width: m.widthPx, top: 0, bottom: 0 }}
                            className="flex items-center px-2 border-r border-slate-600">
                            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">
                              {m.label}
                            </span>
                          </div>
                        ))}
                        {/* Today in header */}
                        <div style={{ position: 'absolute', left: todayPx, top: 0, bottom: 0, width: 2 }}
                          className="bg-red-400 z-30" />
                      </div>

                      {/* Gantt body */}
                      <div style={{ paddingTop: 0 }}>
                        {/* Alternating month backgrounds */}
                        {months.filter(m => m.alt).map(m => (
                          <div key={m.label}
                            style={{
                              position:  'absolute',
                              left:      m.leftPx,
                              width:     m.widthPx,
                              top:       26,
                              bottom:    0,
                            }}
                            className="bg-slate-50/70 pointer-events-none" />
                        ))}

                        {/* Month grid lines */}
                        {months.map(m => (
                          <div key={m.label}
                            style={{ position: 'absolute', left: m.leftPx, top: 26, bottom: 0, width: 1 }}
                            className="bg-slate-200 pointer-events-none" />
                        ))}

                        {/* Today vertical line */}
                        <div style={{ position: 'absolute', left: todayPx, top: 26, bottom: 0, width: 2 }}
                          className="bg-red-400/40 z-10 pointer-events-none" />

                        {/* Task rows */}
                        {visibleTasks.map((task, idx) => {
                          const bar      = getBar(task);
                          const color    = taskColor(task.edt);
                          const isActive = activeEdt === task.edt;
                          const barH     = task.level === 0 ? 14 : task.level <= 2 ? 12 : 10;

                          return (
                            <div
                              key={task.edt}
                              style={{ height: ROW_H, position: 'relative' }}
                              onClick={() => handleTaskClick(task)}
                              className={`border-b cursor-pointer transition-colors
                                ${isActive
                                  ? 'bg-blue-50/50 border-blue-100'
                                  : idx % 2 === 0
                                    ? 'border-slate-50'
                                    : 'bg-slate-50/30 border-slate-100'}`}
                            >
                              {bar && (
                                <>
                                  {/* Background track (full task duration, faint) */}
                                  <div style={{
                                    position:  'absolute',
                                    left:      bar.lx,
                                    width:     bar.wx,
                                    height:    barH,
                                    top:       '50%',
                                    transform: 'translateY(-50%)',
                                    background: color + '22',
                                    border:    `1px solid ${color}44`,
                                    borderRadius: 3,
                                  }} />

                                  {/* Progress fill */}
                                  <div style={{
                                    position:  'absolute',
                                    left:      bar.lx,
                                    width:     Math.round(bar.wx * task.progress / 100),
                                    height:    barH,
                                    top:       '50%',
                                    transform: 'translateY(-50%)',
                                    background: color,
                                    borderRadius: 3,
                                    opacity:   0.82,
                                  }} />

                                  {/* % label (only if bar is wide enough) */}
                                  {bar.wx > 32 && task.progress > 0 && (
                                    <div style={{
                                      position:  'absolute',
                                      left:      bar.lx + 3,
                                      top:       '50%',
                                      transform: 'translateY(-50%)',
                                      fontSize:  9,
                                      color:     '#fff',
                                      fontWeight: 900,
                                      lineHeight: 1,
                                      zIndex:    2,
                                      pointerEvents: 'none',
                                      textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                                    }}>
                                      {task.progress}%
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
