'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, CalendarDays, GripHorizontal, Film,
} from 'lucide-react';
import APSViewer4D, { type ElementColor } from '@/components/viewer3d/APSViewer4D';
import { useProject } from '@/contexts/ProjectContext';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Activity {
  id:         string;
  title:      string;
  discipline: string;
  start_date: string;
  end_date:   string;
  progress:   number;
  color:      string;
  externalIds?: string[]; // populated after merging with links
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PX_PER_DAY = 42;
const ROW_H      = 26;
const DAYS       = 42; // 6 weeks
const SPEEDS     = [0.1, 0.2, 0.5, 1, 3, 7] as const;

const DISC_COLOR: Record<string, string> = {
  'Civil':'#f97316','Estructuras':'#6366f1','Piping':'#0ea5e9','Eléctrico':'#eab308',
  'Instrumentación':'#8b5cf6','Mecánico':'#ef4444','HVAC':'#06b6d4','Pintura':'#ec4899',
  'Aislamiento':'#14b8a6','Andamiaje':'#84cc16','General':'#94a3b8',
};
function discColor(d: string) { return DISC_COLOR[d] ?? '#94a3b8'; }

function addDays(d: Date, n: number): Date { 
  const r = new Date(d); 
  r.setTime(r.getTime() + n * 86_400_000); 
  return r; 
}
function daysBetween(a: Date, b: Date): number { return Math.round((b.getTime() - a.getTime()) / 86_400_000); }
function toDate(s: string): Date { return new Date(s + 'T00:00:00'); }
function fmtDate(d: Date): string { return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }); }
function fmtShort(d: Date): string { return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }); }
const DAY_NAMES = ['Do','Lu','Ma','Mi','Ju','Vi','Sá'];

type Status4D = 'not-started' | 'in-progress' | 'done';

function getStatus(act: Activity, cur: Date): Status4D {
  if (!act.start_date || !act.end_date) return 'not-started';
  const s = toDate(act.start_date), e = toDate(act.end_date);
  if (cur < s) return 'not-started';
  if (cur > e) return 'done';
  return 'in-progress';
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function WeeklyPlan4DLayout() {
  const { currentProject } = useProject();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging     = useRef(false);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const [viewerPct, setViewerPct] = useState(55);
  const [panelMin,  setPanelMin]  = useState(false);
  const [modelUrn,  setModelUrn]  = useState('');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [playing,    setPlaying]    = useState(false);
  const [speed,      setSpeed]      = useState<typeof SPEEDS[number]>(1);
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [globalGrey,  setGlobalGrey]  = useState(true);

  // ── Load activities + links ────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!currentProject?.id) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ projectId: currentProject.id });
      if (modelUrn) params.set('modelUrn', modelUrn);
      const [actsRes, linksRes] = await Promise.all([
        fetch(`/api/weekly-plan/activities?${params}`),
        modelUrn ? fetch(`/api/weekly-plan/links?${params}`) : Promise.resolve(null),
      ]);
      const acts: Activity[]              = await actsRes.json();
      const lnks: Record<string, string[]> = linksRes ? await linksRes.json() : {};
      if (!Array.isArray(acts)) return;
      // Merge links and normalize dates
      const merged = acts.map(a => ({
        ...a,
        start_date:  a.start_date ? a.start_date.split('T')[0] : '',
        end_date:    a.end_date   ? a.end_date.split('T')[0]   : '',
        externalIds: lnks[a.id] ?? [],
      }));
      setActivities(merged);
      // Set current date to project start
      const allDates = merged.flatMap(a => [a.start_date, a.end_date]).filter(Boolean).map(s => new Date(s).getTime());
      if (allDates.length) setCurrentDate(new Date(Math.min(...allDates)));
    } finally {
      setLoading(false);
    }
  }, [currentProject?.id, modelUrn]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Play animation ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!playing) return;
    intervalRef.current = setInterval(() => {
      setCurrentDate(prev => {
        const maxT = Math.max(...activities.flatMap(a => [a.start_date, a.end_date]).filter(Boolean).map(s => new Date(s).getTime()));
        const next = addDays(prev, speed);
        if (next.getTime() > maxT + 7 * 86_400_000) { setPlaying(false); return prev; }
        return next;
      });
    }, 150);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, speed, activities]);

  // ── Resize drag ───────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (mv: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      setViewerPct(Math.min(85, Math.max(20, Math.round(((mv.clientY - r.top) / r.height) * 100))));
    };
    const onUp = () => { dragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  };

  // ── 4D colors ─────────────────────────────────────────────────────────────
  const { elementColors, doneIds } = useMemo(() => {
    const colors: ElementColor[] = [];
    const done:   string[]       = [];
    for (const act of activities) {
      if (!act.externalIds?.length) continue;
      const status = getStatus(act, currentDate);
      const color  = act.color || discColor(act.discipline);
      if (status === 'in-progress') {
        for (const extId of act.externalIds)
          colors.push({ externalId: extId, hex: color, alpha: 0.95 });
      } else if (status === 'done') {
        done.push(...act.externalIds);
      }
    }
    return { elementColors: colors, doneIds: done };
  }, [activities, currentDate]);

  // ── Scroll Gantt to current date ──────────────────────────────────────────
  const ganttRef = useRef<HTMLDivElement>(null);

  // ── Gantt window: 21 days centered on current date ────────────────────────
  const windowStart = useMemo(() => {
    const s = addDays(currentDate, -3); // show a few days before current
    const d = s.getDay();
    const diff = d === 0 ? -6 : 1 - d;
    return addDays(s, diff); // snap to Monday
  }, [currentDate]);

  const ganttWidth = DAYS * PX_PER_DAY;
  const today = new Date();

  // Date range for scrubber
  const { minDate, maxDate } = useMemo(() => {
    const ts = activities.flatMap(a => [a.start_date, a.end_date]).filter(Boolean).map(s => new Date(s).getTime());
    if (!ts.length) return { minDate: Date.now(), maxDate: Date.now() };
    return { minDate: Math.min(...ts), maxDate: Math.max(...ts) };
  }, [activities]);

  // Counts at current date
  const counts = useMemo(() => {
    let inProg = 0, done = 0, notStart = 0;
    for (const a of activities) {
      if (!a.externalIds?.length) continue;
      const s = getStatus(a, currentDate);
      if (s === 'in-progress') inProg   += a.externalIds.length;
      else if (s === 'done')   done      += a.externalIds.length;
      else                     notStart  += a.externalIds.length;
    }
    return { inProg, done, notStart };
  }, [activities, currentDate]);

  return (
    <div ref={containerRef} className="flex flex-col w-full flex-1 min-h-0 overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-slate-900">

      {/* 3D Viewer */}
      <div className="shrink-0 overflow-hidden" style={{ height: panelMin ? 'calc(100% - 36px)' : `${viewerPct}%` }}>
        <APSViewer4D
          onModelUrnReady={urn => { setModelUrn(urn); }}
          elementColors={elementColors}
          doneIds={doneIds}
          globalGrey={globalGrey}
        />
      </div>

      {/* Resize handle */}
      {!panelMin && (
        <div onMouseDown={onMouseDown} className="shrink-0 h-2 bg-slate-700 hover:bg-blue-600 cursor-row-resize flex items-center justify-center transition-colors group">
          <GripHorizontal className="w-8 h-2 text-slate-500 group-hover:text-white" />
        </div>
      )}

      {/* Bottom panel */}
      <div className={`flex flex-col bg-white min-h-0 ${panelMin ? '' : 'flex-1'}`} style={panelMin ? { height: 36 } : undefined}>

        {/* Toolbar */}
        <div className="shrink-0 flex items-center gap-2 px-3 bg-slate-800 text-white select-none" style={{ height: 36 }}>
          <Film className="w-3.5 h-3.5 text-blue-300 shrink-0" />
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-200">4D Trisemanal</span>

          {!panelMin && (
            <>
              <div className="w-px h-4 bg-slate-600 mx-1" />
              {/* Playback */}
              <button onClick={() => { setPlaying(false); setCurrentDate(new Date(minDate)); }} className="text-slate-400 hover:text-white"><SkipBack  className="w-3.5 h-3.5" /></button>
              <button onClick={() => setPlaying(p => !p)}
                className="w-6 h-6 rounded flex items-center justify-center bg-blue-600 hover:bg-blue-500 transition-colors">
                {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
              </button>
              <button onClick={() => { setPlaying(false); setCurrentDate(new Date(maxDate)); }} className="text-slate-400 hover:text-white"><SkipForward className="w-3.5 h-3.5" /></button>

              {/* Speed */}
              <div className="w-px h-4 bg-slate-600 mx-1" />
              {SPEEDS.map(s => (
                <button key={s} onClick={() => setSpeed(s)}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${speed === s ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>{s}d</button>
              ))}

              {/* Date */}
              <div className="w-px h-4 bg-slate-600 mx-1" />
              <CalendarDays className="w-3.5 h-3.5 text-blue-300" />
              <span className="text-[12px] font-mono font-semibold text-blue-200 min-w-[120px]">{fmtDate(currentDate)}</span>
              <button onClick={() => setCurrentDate(new Date())} className="text-[10px] px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300">Hoy</button>

              {/* Counts */}
              <div className="w-px h-4 bg-slate-600 mx-1" />
              <span className="text-[10px] text-amber-300">▶ {counts.inProg}</span>
              <span className="text-[10px] text-emerald-400">✓ {counts.done}</span>
              <span className="text-[10px] text-slate-500">○ {counts.notStart}</span>

              <div className="w-px h-4 bg-slate-600 mx-1" />
              <button onClick={() => setGlobalGrey(p => !p)}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${globalGrey ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                Modo Fantasma
              </button>
            </>
          )}

          <button onClick={() => setPanelMin(p => !p)} className="ml-auto text-slate-400 hover:text-white text-[10px] px-2 py-0.5 rounded hover:bg-slate-700 transition-colors">
            {panelMin ? '▲ Expandir' : '▼ Minimizar'}
          </button>
        </div>

        {/* Scrubber */}
        {!panelMin && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 bg-slate-100 border-b border-slate-200">
            <span className="text-[10px] text-slate-500 shrink-0">{fmtShort(new Date(minDate))}</span>
            <input type="range" min={minDate} max={maxDate} step={86_400_000} value={currentDate.getTime()}
              onChange={e => { setPlaying(false); setCurrentDate(new Date(+e.target.value)); }}
              className="flex-1 h-1.5 accent-blue-600 cursor-pointer" />
            <span className="text-[10px] text-slate-500 shrink-0">{fmtShort(new Date(maxDate))}</span>
          </div>
        )}

        {/* Gantt */}
        {!panelMin && (
          <div className="flex flex-1 overflow-hidden min-h-0">

            {/* Left: activity names */}
            <div className="flex flex-col shrink-0 border-r border-slate-200 bg-white overflow-hidden" style={{ width: 260 }}>
              <div className="shrink-0 flex items-center px-3 bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wide" style={{ height: 28 }}>
                Actividad
              </div>
              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                {loading ? (
                  <div className="flex items-center justify-center h-16 text-slate-400 text-xs gap-2">Cargando…</div>
                ) : activities.length === 0 ? (
                  <div className="flex items-center justify-center h-16 text-slate-400 text-xs">Sin actividades vinculadas</div>
                ) : activities.map((act, idx) => {
                  const color  = act.color || discColor(act.discipline);
                  const status = getStatus(act, currentDate);
                  const dotCls = status === 'in-progress' ? 'bg-amber-400' : status === 'done' ? 'bg-emerald-500' : 'bg-slate-300';
                  return (
                    <div key={act.id}
                      className={`flex items-center gap-2 px-3 border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                      style={{ height: ROW_H }}>
                      <div className={`shrink-0 w-2 h-2 rounded-full ${dotCls}`} />
                      <span className="text-[11px] text-slate-700 truncate flex-1" title={act.title}>{act.title}</span>
                      <span className="text-[9px] shrink-0 px-1 py-0.5 rounded text-white font-medium"
                        style={{ background: color }}>{act.discipline.slice(0, 3)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Gantt bars (3-week window centered on current date) */}
            <div ref={ganttRef} className="flex-1 overflow-auto">
              <div style={{ width: ganttWidth, position: 'relative', minHeight: '100%' }}>

                {/* Day headers */}
                <div className="sticky top-0 z-20 flex bg-slate-700 border-b border-slate-600" style={{ height: 28 }}>
                  {Array.from({ length: DAYS }, (_, i) => {
                    const day     = addDays(windowStart, i);
                    const isCurrent = daysBetween(currentDate, day) === 0;
                    const isToday   = daysBetween(today, day) === 0;
                    const isWknd    = day.getDay() === 0 || day.getDay() === 6;
                    return (
                      <div key={i} style={{ width: PX_PER_DAY, minWidth: PX_PER_DAY }}
                        className={`flex flex-col items-center justify-center border-r border-slate-600 text-[9px] font-medium select-none
                          ${isCurrent ? 'bg-red-600 text-white' : isToday ? 'bg-blue-600 text-white' : isWknd ? 'bg-slate-600 text-slate-400' : 'text-slate-300'}`}>
                        <span>{DAY_NAMES[day.getDay()]}</span>
                        <span className="font-bold">{day.getDate()}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Current date line */}
                {(() => {
                  const off = daysBetween(windowStart, currentDate);
                  if (off < 0 || off >= DAYS) return null;
                  return (
                    <div className="absolute top-0 bottom-0 z-20 pointer-events-none" style={{ left: off * PX_PER_DAY + PX_PER_DAY / 2 }}>
                      <div className="absolute top-0 bottom-0 w-0.5 bg-red-500/70" />
                    </div>
                  );
                })()}

                {/* Activity rows */}
                {activities.map((act, idx) => {
                  const color   = act.color || discColor(act.discipline);
                  const status  = getStatus(act, currentDate);
                  const s       = toDate(act.start_date);
                  const e       = toDate(act.end_date);
                  const barLeft  = daysBetween(windowStart, s) * PX_PER_DAY;
                  const barWidth = Math.max(PX_PER_DAY * 0.5, daysBetween(s, addDays(e, 1)) * PX_PER_DAY);
                  const clampL   = Math.max(0, barLeft);
                  const clampR   = Math.min(ganttWidth, barLeft + barWidth);
                  const visible  = clampR > clampL;

                  const barColor = status === 'in-progress' ? color : status === 'done' ? '#22c55e' : '#cbd5e1';

                  return (
                    <div key={act.id}
                      className={`relative flex items-center border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                      style={{ height: ROW_H }}>
                      {/* Weekend shading */}
                      {Array.from({ length: DAYS }, (_, i) => {
                        const d = addDays(windowStart, i);
                        if (d.getDay() !== 0 && d.getDay() !== 6) return null;
                        return <div key={i} className="absolute top-0 bottom-0 bg-slate-100/60 pointer-events-none" style={{ left: i * PX_PER_DAY, width: PX_PER_DAY }} />;
                      })}
                      {visible && (
                        <div className="absolute rounded pointer-events-none" style={{ left: clampL, width: clampR - clampL, top: 6, height: 14, background: barColor, opacity: status === 'not-started' ? 0.3 : 0.9 }}>
                          {act.progress > 0 && <div className="absolute inset-y-0 left-0 rounded bg-black/20" style={{ width: `${act.progress}%` }} />}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
