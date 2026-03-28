'use client';

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Play, Pause, SkipBack, SkipForward, ChevronRight, ChevronDown,
  CalendarDays, GripHorizontal, Film, Box,
} from 'lucide-react';
import APSViewer4D, { type ElementColor } from './APSViewer4D';
import { useProject } from '@/contexts/ProjectContext';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Task4D {
  edt:         string;
  name:        string;
  level:       number;
  start:       string | null;
  end:         string | null;
  baseStart:   string | null;
  baseEnd:     string | null;
  progress:    number;
  discipline:  string;
  externalIds: string[];
  hasChildren: boolean;
}

type Status4D = 'not-started' | 'in-progress' | 'complete' | 'late';

// ── Constants ─────────────────────────────────────────────────────────────────
const PX_PER_DAY = 5;
const ROW_H      = 26;

const STATUS_COLOR: Record<Status4D, string> = {
  'in-progress': '#f59e0b',   // amber  — active construction
  'complete':    '#22c55e',   // green  — finished
  'late':        '#ef4444',   // red    — overdue
  'not-started': '',          // default model color (no theming)
};

const STATUS_LABEL: Record<Status4D, string> = {
  'in-progress': 'En progreso',
  'complete':    'Completado',
  'late':        'Atrasado',
  'not-started': 'No iniciado',
};

const STATUS_BAR_BG: Record<Status4D, string> = {
  'in-progress': 'bg-amber-400',
  'complete':    'bg-emerald-500',
  'late':        'bg-red-500',
  'not-started': 'bg-slate-300',
};

const SPEEDS = [1, 7, 14, 30] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

function getStatus(task: Task4D, current: Date): Status4D {
  if (!task.start || !task.end) return 'not-started';
  const s = new Date(task.start);
  const e = new Date(task.end);
  if (task.progress >= 100) return 'complete';
  if (current < s) return 'not-started';
  if (current > e) return 'late';
  return 'in-progress';
}

// ── Gantt geometry ─────────────────────────────────────────────────────────────
function useGanttGeometry(tasks: Task4D[]) {
  return useMemo(() => {
    const dates = tasks
      .flatMap(t => [t.start, t.end, t.baseStart, t.baseEnd])
      .filter(Boolean)
      .map(s => new Date(s!).getTime());
    if (!dates.length) return { projStart: new Date(), totalPx: 1200, months: [], todayPx: 0 };

    const projStart = new Date(Math.min(...dates));
    const projEnd   = new Date(Math.max(...dates));
    projStart.setDate(1); // align to month start

    const totalDays = daysBetween(projStart, projEnd) + 60;
    const totalPx   = totalDays * PX_PER_DAY;
    const todayPx   = daysBetween(projStart, new Date()) * PX_PER_DAY;

    // Build month header
    const months: { label: string; x: number; width: number }[] = [];
    const cur = new Date(projStart);
    while (cur <= projEnd) {
      const x     = daysBetween(projStart, cur) * PX_PER_DAY;
      const next  = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const days  = daysBetween(cur, next);
      months.push({
        label: cur.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' }),
        x,
        width: days * PX_PER_DAY,
      });
      cur.setMonth(cur.getMonth() + 1);
      cur.setDate(1);
    }

    return { projStart, totalPx, months, todayPx };
  }, [tasks]);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Viewer4DLayout() {
  const { currentProject } = useProject();
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRef      = useRef<HTMLDivElement>(null);
  const rightRef     = useRef<HTMLDivElement>(null);
  const syncing      = useRef(false);
  const dragging     = useRef(false);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const [viewerPct,    setViewerPct]    = useState(52);
  const [ganttMin,     setGanttMin]     = useState(false);
  const [tasks,        setTasks]        = useState<Task4D[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [collapsed,    setCollapsed]    = useState<Record<string, boolean>>({});
  const [modelUrn,     setModelUrn]     = useState('');
  const [currentDate,  setCurrentDate]  = useState<Date>(() => new Date());
  const [playing,      setPlaying]      = useState(false);
  const [speed,        setSpeed]        = useState<typeof SPEEDS[number]>(7);
  const [activeTask,   setActiveTask]   = useState<Task4D | null>(null);
  const [globalGrey,   setGlobalGrey]   = useState(true);

  const { projStart, totalPx, months, todayPx } = useGanttGeometry(tasks);

  // ── Fetch tasks ───────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (currentProject?.id) params.set('projectId', currentProject.id);
    if (modelUrn)            params.set('modelUrn', modelUrn);
    fetch(`/api/aps/wbs-linked?${params}`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        setTasks(data);
        // Collapse summary tasks (level < 3) if they have children
        const init: Record<string, boolean> = {};
        data.forEach((t: Task4D) => {
          if (t.hasChildren && t.level < 2) init[t.edt] = true;
        });
        setCollapsed(init);
        // Start date at project start
        const allDates = data
          .flatMap((t: Task4D) => [t.start, t.end])
          .filter((s: string | null): s is string => !!s)
          .map((s: string) => new Date(s).getTime());
        if (allDates.length) setCurrentDate(new Date(Math.min(...allDates)));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentProject?.id, modelUrn]);

  // ── Play/Pause animation ──────────────────────────────────────────────────
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!playing) return;
    intervalRef.current = setInterval(() => {
      setCurrentDate(prev => {
        const next = addDays(prev, speed);
        // Stop at project end
        const allEnds = tasks.map(t => t.end).filter(Boolean).map(s => new Date(s!).getTime());
        if (allEnds.length && next.getTime() > Math.max(...allEnds) + 30 * 86_400_000) {
          setPlaying(false);
          return prev;
        }
        return next;
      });
    }, 120);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, speed, tasks]);

  // ── 4D element colors ─────────────────────────────────────────────────────
  // Not-started elements intentionally omitted: the globalGrey root coat covers them.
  // Only in-progress / complete / late elements get an explicit color override.
  const elementColors = useMemo<ElementColor[]>(() => {
    const colors: ElementColor[] = [];
    for (const task of tasks) {
      if (!task.externalIds.length) continue;
      const status = getStatus(task, currentDate);
      const hex    = STATUS_COLOR[status];
      if (!hex) continue; // not-started → stay phantom via root theming
      for (const extId of task.externalIds) {
        colors.push({ externalId: extId, hex, alpha: 0.96 }); // high alpha = vivid, "turned on"
      }
    }
    return colors;
  }, [tasks, currentDate]);

  // ── Visible tasks (tree collapse) ─────────────────────────────────────────
  const visibleTasks = useMemo(() => {
    return tasks.filter(task => {
      const parts = task.edt.split('.');
      for (let i = 1; i < parts.length; i++) {
        if (collapsed[parts.slice(0, i).join('.')]) return false;
      }
      return true;
    });
  }, [tasks, collapsed]);

  // ── Toggle collapse ───────────────────────────────────────────────────────
  const toggleCollapse = useCallback((edt: string) => {
    setCollapsed(prev => ({ ...prev, [edt]: !prev[edt] }));
  }, []);

  // ── Scroll sync ───────────────────────────────────────────────────────────
  const onLeftScroll  = () => {
    if (syncing.current || !rightRef.current || !leftRef.current) return;
    syncing.current = true;
    rightRef.current.scrollTop = leftRef.current.scrollTop;
    syncing.current = false;
  };
  const onRightScroll = () => {
    if (syncing.current || !leftRef.current || !rightRef.current) return;
    syncing.current = true;
    leftRef.current.scrollTop = rightRef.current.scrollTop;
    syncing.current = false;
  };

  // ── Resize drag ───────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (mv: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct  = Math.round(((mv.clientY - rect.top) / rect.height) * 100);
      setViewerPct(Math.min(85, Math.max(20, pct)));
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  };

  // ── Scrubber range ────────────────────────────────────────────────────────
  const allDates = useMemo(() => {
    const ts = tasks.flatMap(t => [t.start, t.end]).filter(Boolean).map(s => new Date(s!).getTime());
    if (!ts.length) return { min: Date.now(), max: Date.now() };
    return { min: Math.min(...ts), max: Math.max(...ts) };
  }, [tasks]);

  // ── Scroll Gantt to current date when it changes ─────────────────────────
  useEffect(() => {
    const right = rightRef.current;
    if (!right || !projStart) return;
    const x = daysBetween(projStart, currentDate) * PX_PER_DAY - right.clientWidth / 2;
    right.scrollLeft = Math.max(0, x);
  }, [currentDate, projStart]);

  // ── Current date px position ──────────────────────────────────────────────
  const currentDatePx = daysBetween(projStart, currentDate) * PX_PER_DAY;

  // ── Status legend ─────────────────────────────────────────────────────────
  const legend: { status: Status4D; label: string }[] = [
    { status: 'in-progress', label: 'En progreso' },
    { status: 'complete',    label: 'Completado'  },
    { status: 'late',        label: 'Atrasado'    },
    { status: 'not-started', label: 'No iniciado' },
  ];

  // Count linked elements affected at current date
  const activeCounts = useMemo(() => {
    const counts: Record<Status4D, number> = {
      'in-progress': 0, 'complete': 0, 'late': 0, 'not-started': 0,
    };
    for (const task of tasks) {
      if (!task.externalIds.length) continue;
      counts[getStatus(task, currentDate)] += task.externalIds.length;
    }
    return counts;
  }, [tasks, currentDate]);

  return (
    <div ref={containerRef}
      className="flex flex-col w-full flex-1 min-h-0 overflow-hidden rounded-xl
        border border-slate-200 shadow-sm bg-slate-900">

      {/* ── 3D Viewer ────────────────────────────────────────────────────── */}
      <div className="shrink-0 overflow-hidden"
        style={{ height: ganttMin ? 'calc(100% - 36px)' : `${viewerPct}%` }}>
        <APSViewer4D
          onModelUrnReady={setModelUrn}
          elementColors={elementColors}
        />
      </div>

      {/* ── Resize handle ────────────────────────────────────────────────── */}
      {!ganttMin && (
        <div onMouseDown={onMouseDown}
          className="shrink-0 h-2 bg-slate-700 hover:bg-blue-600 cursor-row-resize
            flex items-center justify-center transition-colors group">
          <GripHorizontal className="w-8 h-2 text-slate-500 group-hover:text-white transition-colors" />
        </div>
      )}

      {/* ── 4D Gantt panel ───────────────────────────────────────────────── */}
      <div className={`flex flex-col overflow-hidden bg-white min-h-0 ${ganttMin ? '' : 'flex-1'}`}
        style={ganttMin ? { height: 36 } : undefined}>

        {/* ── Toolbar ────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center gap-2 px-3 bg-slate-800 text-white select-none"
          style={{ height: 36 }}>
          <Film className="w-3.5 h-3.5 text-blue-300 shrink-0" />
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-200 mr-1">
            Simulación 4D
          </span>

          {!ganttMin && (
            <>
              {/* Playback controls */}
              <div className="w-px h-4 bg-slate-600 mx-1" />
              <button onClick={() => { setPlaying(false); setCurrentDate(new Date(allDates.min)); }}
                title="Ir al inicio" className="text-slate-400 hover:text-white transition-colors">
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setPlaying(p => !p)}
                title={playing ? 'Pausar' : 'Reproducir'}
                className="w-6 h-6 rounded flex items-center justify-center
                  bg-blue-600 hover:bg-blue-500 transition-colors text-white">
                {playing
                  ? <Pause  className="w-3.5 h-3.5" />
                  : <Play   className="w-3.5 h-3.5 ml-0.5" />}
              </button>
              <button onClick={() => { setPlaying(false); setCurrentDate(new Date(allDates.max)); }}
                title="Ir al final" className="text-slate-400 hover:text-white transition-colors">
                <SkipForward className="w-3.5 h-3.5" />
              </button>

              {/* Speed selector */}
              <div className="w-px h-4 bg-slate-600 mx-1" />
              <span className="text-[10px] text-slate-400">Vel:</span>
              {SPEEDS.map(s => (
                <button key={s} onClick={() => setSpeed(s)}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                    speed === s
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}>
                  {s}d
                </button>
              ))}

              {/* Current date */}
              <div className="w-px h-4 bg-slate-600 mx-1" />
              <CalendarDays className="w-3.5 h-3.5 text-blue-300 shrink-0" />
              <span className="text-[12px] font-mono font-semibold text-blue-200 min-w-[120px]">
                {fmtDate(currentDate)}
              </span>
              <button onClick={() => setCurrentDate(new Date())}
                className="text-[10px] px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600
                  text-slate-300 hover:text-white transition-colors">
                Hoy
              </button>

              {/* Status legend */}
              <div className="w-px h-4 bg-slate-600 mx-1" />
              <div className="flex items-center gap-3 text-[10px]">
                {legend.map(({ status, label }) => (
                  <div key={status} className="flex items-center gap-1">
                    <div className={`w-2.5 h-2.5 rounded-sm ${
                      status === 'not-started' ? 'bg-slate-500' : STATUS_BAR_BG[status]
                    }`} />
                    <span className="text-slate-400">
                      {label}
                      {activeCounts[status] > 0 && (
                        <span className="ml-0.5 text-slate-300">({activeCounts[status]})</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {/* Loading indicator */}
              {loading && (
                <span className="text-[10px] text-slate-400 animate-pulse ml-1">Cargando…</span>
              )}

              {/* Global Grey Filter Toggle */}
              <div className="w-px h-4 bg-slate-600 mx-1 ml-auto" />
              <button onClick={() => setGlobalGrey(p => !p)}
                title="Alternar filtro gris del modelo base"
                className={`text-[10px] px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${
                  globalGrey ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}>
                <Box className="w-3 h-3" />
                Modo Fantasma
              </button>
            </>
          )}

          {/* Minimize toggle */}
          <button onClick={() => setGanttMin(p => !p)}
            className="ml-2 text-slate-400 hover:text-white text-[10px] px-2 py-0.5
              rounded hover:bg-slate-700 transition-colors">
            {ganttMin ? '▲ Expandir' : '▼ Minimizar'}
          </button>
        </div>

        {/* ── Date scrubber ───────────────────────────────────────────────── */}
        {!ganttMin && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 bg-slate-100 border-b border-slate-200">
            <span className="text-[10px] text-slate-500 shrink-0">{fmtShort(new Date(allDates.min))}</span>
            <input
              type="range"
              min={allDates.min}
              max={allDates.max}
              step={86_400_000}
              value={currentDate.getTime()}
              onChange={e => { setPlaying(false); setCurrentDate(new Date(+e.target.value)); }}
              className="flex-1 h-1.5 accent-blue-600 cursor-pointer"
            />
            <span className="text-[10px] text-slate-500 shrink-0">{fmtShort(new Date(allDates.max))}</span>
          </div>
        )}

        {/* ── Gantt body ──────────────────────────────────────────────────── */}
        {!ganttMin && (
          <div className="flex flex-1 overflow-hidden min-h-0">

            {/* Left panel — task names */}
            <div className="flex flex-col shrink-0 border-r border-slate-200 bg-white" style={{ width: 320 }}>
              {/* Column header */}
              <div className="shrink-0 flex items-center px-3 bg-slate-50 border-b border-slate-200"
                style={{ height: 28 }}>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Actividad {!loading && tasks.length > 0 && `(${tasks.filter(t => t.externalIds.length > 0).length} vinculadas)`}
                </span>
              </div>

              {/* Rows */}
              <div ref={leftRef} className="flex-1 overflow-y-auto overflow-x-hidden" onScroll={onLeftScroll}>
                {loading ? (
                  <div className="flex items-center justify-center h-20 text-sm text-slate-400">
                    Cargando actividades…
                  </div>
                ) : visibleTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-20 gap-1 text-slate-400">
                    <Film className="w-5 h-5" />
                    <span className="text-xs">Sin actividades vinculadas al modelo</span>
                  </div>
                ) : visibleTasks.map((task, idx) => {
                  const status = getStatus(task, currentDate);
                  const isActive = activeTask?.edt === task.edt;
                  return (
                    <div key={task.edt}
                      onClick={() => setActiveTask(isActive ? null : task)}
                      className={`flex items-center gap-1 px-2 border-b border-slate-100 cursor-pointer
                        transition-colors select-none hover:bg-blue-50
                        ${isActive ? 'bg-blue-100' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}
                      style={{ height: ROW_H, paddingLeft: 8 + task.level * 12 }}>

                      {/* Collapse toggle */}
                      {task.hasChildren ? (
                        <button onClick={e => { e.stopPropagation(); toggleCollapse(task.edt); }}
                          className="shrink-0 w-4 h-4 flex items-center justify-center
                            text-slate-400 hover:text-slate-700 transition-colors">
                          {collapsed[task.edt]
                            ? <ChevronRight className="w-3 h-3" />
                            : <ChevronDown  className="w-3 h-3" />}
                        </button>
                      ) : (
                        <div className="shrink-0 w-4" />
                      )}

                      {/* Status dot */}
                      <div className={`shrink-0 w-2 h-2 rounded-full ${
                        status === 'not-started' ? 'bg-slate-300' : STATUS_BAR_BG[status]
                      }`} />

                      {/* Task name */}
                      <span className={`flex-1 text-[11px] truncate ml-1 ${
                        task.level === 0 ? 'font-bold text-slate-700'
                          : task.level === 1 ? 'font-semibold text-slate-600'
                          : 'font-normal text-slate-600'
                      }`} title={`${task.edt} — ${task.name}`}>
                        {task.name || task.edt}
                      </span>

                      {/* Linked element count badge */}
                      {task.externalIds.length > 0 && (
                        <span className="shrink-0 text-[9px] px-1 py-0.5 rounded
                          bg-blue-100 text-blue-700 font-medium ml-1">
                          {task.externalIds.length}
                        </span>
                      )}

                      {/* Progress */}
                      {task.progress > 0 && (
                        <span className="shrink-0 text-[9px] text-slate-400 ml-1">
                          {task.progress}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right panel — Gantt bars */}
            <div ref={rightRef}
              className="flex-1 overflow-auto"
              onScroll={onRightScroll}>
              <div style={{ width: totalPx, position: 'relative', minHeight: '100%' }}>

                {/* Month header — sticky so it stays while scrolling vertically */}
                <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-slate-50"
                  style={{ height: 28, width: totalPx }}>
                  {months.map((m, i) => (
                    <div key={i}
                      style={{ width: m.width, minWidth: m.width }}
                      className="shrink-0 flex items-center px-2 border-r border-slate-200 text-[10px]
                        font-semibold text-slate-500 uppercase tracking-wide overflow-hidden">
                      {m.label}
                    </div>
                  ))}
                </div>

                {/* Today line */}
                {todayPx >= 0 && todayPx <= totalPx && (
                  <div className="absolute top-0 bottom-0 w-px bg-blue-400/40 z-10 pointer-events-none"
                    style={{ left: todayPx }} />
                )}

                {/* Current date line */}
                <div className="absolute top-0 bottom-0 z-20 pointer-events-none"
                  style={{ left: currentDatePx }}>
                  <div className="absolute top-0 bottom-0 w-0.5 bg-red-500/80" />
                  <div className="absolute top-7 -translate-x-1/2 bg-red-500 text-white text-[9px]
                    font-bold px-1 py-0.5 rounded whitespace-nowrap shadow">
                    {fmtShort(currentDate)}
                  </div>
                </div>

                {/* Gantt rows */}
                <div>
                  {visibleTasks.map((task, idx) => {
                    const status   = getStatus(task, currentDate);
                    const isActive = activeTask?.edt === task.edt;

                    const barLeft  = task.start ? daysBetween(projStart, new Date(task.start)) * PX_PER_DAY : null;
                    const barWidth = (task.start && task.end)
                      ? Math.max(4, daysBetween(new Date(task.start), new Date(task.end)) * PX_PER_DAY)
                      : null;

                    const baseLeft  = task.baseStart ? daysBetween(projStart, new Date(task.baseStart)) * PX_PER_DAY : null;
                    const baseWidth = (task.baseStart && task.baseEnd)
                      ? Math.max(4, daysBetween(new Date(task.baseStart), new Date(task.baseEnd)) * PX_PER_DAY)
                      : null;

                    return (
                      <div key={task.edt}
                        onClick={() => setActiveTask(isActive ? null : task)}
                        className={`relative flex items-center border-b border-slate-100 cursor-pointer
                          transition-colors hover:bg-blue-50/50
                          ${isActive ? 'bg-blue-50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                        style={{ height: ROW_H }}>

                        {/* Baseline bar (thin, below) */}
                        {baseLeft != null && baseWidth != null && (
                          <div className="absolute h-1 rounded-sm bg-slate-300/60"
                            style={{ left: baseLeft, width: baseWidth, top: ROW_H - 6 }} />
                        )}

                        {/* Main bar */}
                        {barLeft != null && barWidth != null && (
                          <div
                            className={`absolute rounded ${
                              status === 'not-started'
                                ? 'bg-slate-200'
                                : STATUS_BAR_BG[status]
                            } transition-colors`}
                            style={{
                              left:   barLeft,
                              width:  barWidth,
                              top:    5,
                              height: 14,
                            }}
                          >
                            {/* Progress fill */}
                            {task.progress > 0 && status !== 'not-started' && (
                              <div className="absolute inset-y-0 left-0 rounded bg-black/20"
                                style={{ width: `${task.progress}%` }} />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
