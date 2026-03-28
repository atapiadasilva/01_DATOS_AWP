'use client';

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Plus, Trash2, Link2, Link2Off, ChevronLeft, ChevronRight,
  GripHorizontal, CalendarDays, Loader2, Check, X,
  Play, Pause, SkipBack, Ghost, Calendar, Palette,
} from 'lucide-react';
import APSViewer4D from '@/components/viewer3d/APSViewer4D';
import { useProject } from '@/contexts/ProjectContext';

// ── Types ─────────────────────────────────────────────────────────────────────
type ElementColor = { externalId: string, hex: string, alpha?: number };

interface Activity {
  id:         string;
  title:      string;
  discipline: string;
  start_date: string;
  end_date:   string;
  progress:   number;
  wbs_edt:    string;
  wbs_name:   string;
  notes:      string;
  color:      string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PX_PER_DAY = 42;
const ROW_H      = 28; // Smaller for high density
const DAYS       = 42; // 6 weeks
const SPEEDS     = [0.1, 0.2, 0.5, 1, 3, 7] as const;

const DISCIPLINES = [
  'Civil', 'Estructuras', 'Piping', 'Eléctrico',
  'Instrumentación', 'Mecánico', 'HVAC', 'Pintura',
  'Aislamiento', 'Andamiaje', 'General',
];

const DISC_COLOR: Record<string, string> = {
  'Civil':           '#f97316',
  'Estructuras':     '#6366f1',
  'Piping':          '#0ea5e9',
  'Eléctrico':       '#eab308',
  'Instrumentación': '#8b5cf6',
  'Mecánico':        '#ef4444',
  'HVAC':            '#06b6d4',
  'Pintura':         '#ec4899',
  'Aislamiento':     '#14b8a6',
  'Andamiaje':       '#84cc16',
  'General':         '#94a3b8',
};

function discColor(d: string) { return DISC_COLOR[d] ?? '#94a3b8'; }

// ── Date helpers ──────────────────────────────────────────────────────────────
function toStr(d: Date): string { return d.toISOString().split('T')[0]; }
function toDate(s: string): Date { return new Date(s + 'T00:00:00'); }
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setTime(r.getTime() + n * 86_400_000); return r;
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
function prevMonday(d: Date): Date {
  const r = new Date(d); r.setDate(r.getDate() - (r.getDay() || 7) + 1); r.setHours(0,0,0,0); return r;
}
function fmtRange(a: Date, b: Date): string {
  const o: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
  return `${a.toLocaleDateString('es-CL', o)} — ${b.toLocaleDateString('es-CL', { ...o, year: '2-digit' })}`;
}
function fmtDate(d: Date): string { 
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }); 
}

type Status4D = 'not-started' | 'in-progress' | 'done';
function getStatus(act: Activity, cur: Date): Status4D {
  if (!act.start_date || !act.end_date) return 'not-started';
  const s = toDate(act.start_date), e = toDate(act.end_date);
  if (cur < s) return 'not-started';
  if (cur > e) return 'done';
  return 'in-progress';
}

const WEEK_COLORS = [
  '#22c55e', // Sem 1: Verde
  '#eab308', // Sem 2: Amarillo
  '#f97316', // Sem 3: Naranja
  '#ef4444', // Sem 4: Rojo
  '#8b5cf6', // Sem 5: Morado
  '#0ea5e9', // Sem 6: Azul
];
function getWeekColor(sDate: string, weekStart: Date): string {
  if (!sDate) return '#94a3b8';
  const s = toDate(sDate);
  const days = Math.floor((s.getTime() - weekStart.getTime()) / 86400000);
  const weekIdx = Math.max(0, Math.floor(days / 7));
  return WEEK_COLORS[Math.min(weekIdx, WEEK_COLORS.length - 1)];
}

const DAY_NAMES = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

// ── Empty activity factory ────────────────────────────────────────────────────
function emptyActivity(projectId?: string): Omit<Activity, 'id'> {
  const today = new Date();
  return {
    title: '',
    discipline: 'Civil',
    start_date: toStr(today),
    end_date:   toStr(addDays(today, 6)),
    progress:   0,
    wbs_edt:    '',
    wbs_name:   '',
    notes:      '',
    color:      '',
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function WeeklyPlanLayout() {
  const { currentProject } = useProject();

  // Layout
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging     = useRef(false);
  const [viewerPct, setViewerPct] = useState(42);
  const [panelMin,  setPanelMin]  = useState(false);

  // Data
  const [activities, setActivities] = useState<Activity[]>([]);
  const [links,      setLinks]      = useState<Record<string, string[]>>({});
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);

  // Selection / edit
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [editDraft,   setEditDraft]   = useState<Partial<Activity> | null>(null);
  const [isNew,       setIsNew]       = useState(false);
  const [discFilter,  setDiscFilter]  = useState<string>('');
  const [draggedId,   setDraggedId]   = useState<string | null>(null);
  const [showColors,  setShowColors]  = useState(true);
  const [dirtyIds,    setDirtyIds]    = useState<Set<string>>(new Set());

  // Viewer
  const [modelUrn,  setModelUrn]  = useState('');
  const [viewerSel, setViewerSel] = useState<string[]>([]); // current APS selection
  const [basket,    setBasket]    = useState<string[]>([]); // accumulated for linking
  const activitiesRef = useRef<Activity[]>([]);             // always-fresh ref for drag save

  // 3-week window
  const [weekStart, setWeekStart] = useState<Date>(() => prevMonday(new Date()));

  // 4D Playback
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playing,     setPlaying]     = useState(false);
  const [speed,       setSpeed]       = useState<typeof SPEEDS[number]>(1);
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [globalGrey,  setGlobalGrey]  = useState(true);

  // Gantt drag
  const dragRef = useRef<{
    actId: string; type: 'move' | 'start' | 'end';
    startX: number; origStart: string; origEnd: string;
    curStart: string; curEnd: string;
  } | null>(null);

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!currentProject?.id) return;
    setLoading(true);
    try {
      const [actsRes, linksRes] = await Promise.all([
        fetch(`/api/weekly-plan/activities?projectId=${currentProject.id}`),
        modelUrn
          ? fetch(`/api/weekly-plan/links?projectId=${currentProject.id}&modelUrn=${encodeURIComponent(modelUrn)}`)
          : Promise.resolve(null),
      ]);
      const acts = await actsRes.json();
      if (Array.isArray(acts)) {
        setActivities(acts.map(a => ({
          ...a,
          start_date: a.start_date ? a.start_date.split('T')[0] : '',
          end_date:   a.end_date   ? a.end_date.split('T')[0]   : '',
        })));
      }
      if (linksRes) {
        const lnks = await linksRes.json();
        if (lnks && typeof lnks === 'object') setLinks(lnks);
      }
    } finally {
      setLoading(false);
    }
  }, [currentProject?.id, modelUrn]);

  useEffect(() => { load(); }, [load]);

  // Load links separately when modelUrn becomes available
  useEffect(() => {
    if (!currentProject?.id || !modelUrn) return;
    fetch(`/api/weekly-plan/links?projectId=${currentProject.id}&modelUrn=${encodeURIComponent(modelUrn)}`)
      .then(r => r.json())
      .then(d => { if (d && typeof d === 'object') setLinks(d); });
  }, [currentProject?.id, modelUrn]);

  // ── Viewer selection → accumulate in basket ────────────────────────────────
  // Each APS click fires onSelectionChange with ONLY the clicked element(s).
  // We merge into the basket so multiple clicks accumulate.
  // Clicking empty space (extIds=[]) keeps the basket intact.
  const handleViewerSelection = useCallback((extIds: string[]) => {
    setViewerSel(extIds);
    if (extIds.length > 0) {
      setBasket(prev => Array.from(new Set([...prev, ...extIds])));
    }
  }, []);

  // ── Save activity ──────────────────────────────────────────────────────────
  const saveActivity = useCallback(async (act: Partial<Activity>) => {
    if (!currentProject?.id || !act.title?.trim()) return;
    setSaving(true);
    try {
      const method = isNew ? 'POST' : 'PUT';
      const body   = isNew
        ? { projectId: currentProject.id, title: act.title, discipline: act.discipline, startDate: act.start_date, endDate: act.end_date, progress: act.progress, wbsEdt: act.wbs_edt, wbsName: act.wbs_name, notes: act.notes, color: act.color }
        : { id: act.id, title: act.title, discipline: act.discipline, startDate: act.start_date, endDate: act.end_date, progress: act.progress, wbsEdt: act.wbs_edt, wbsName: act.wbs_name, notes: act.notes, color: act.color };
      const res  = await fetch('/api/weekly-plan/activities', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const raw  = await res.json();
      // Normalize ISO dates → YYYY-MM-DD (DB returns full timestamp with timezone)
      const data = { ...raw, start_date: raw.start_date?.split('T')[0] ?? raw.start_date, end_date: raw.end_date?.split('T')[0] ?? raw.end_date };
      if (isNew) {
        setActivities(p => [...p, data]);
        setSelectedId(data.id);
        setIsNew(false);
      } else {
        setActivities(p => p.map(a => a.id === data.id ? data : a));
      }
      setEditDraft(null);
    } finally {
      setSaving(false);
    }
  }, [currentProject?.id, isNew]);

  // ── Delete activity ────────────────────────────────────────────────────────
  const deleteActivity = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar esta actividad?')) return;
    await fetch('/api/weekly-plan/activities', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setActivities(p => p.filter(a => a.id !== id));
    if (selectedId === id) { setSelectedId(null); setEditDraft(null); }
  }, [selectedId]);

  // ── Link elements (basket → activity) ─────────────────────────────────────
  const linkElements = useCallback(async () => {
    if (!selectedId || !basket.length || !currentProject?.id || !modelUrn) return;
    setSaving(true);
    try {
      await fetch('/api/weekly-plan/links', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ activityId: selectedId, projectId: currentProject.id, modelUrn, externalIds: basket }),
      });
      setLinks(p => ({ ...p, [selectedId]: Array.from(new Set([...(p[selectedId] ?? []), ...basket])) }));
      setBasket([]);   // clear basket after successful link
      setViewerSel([]); // deselect in viewer
    } finally {
      setSaving(false);
    }
  }, [selectedId, basket, currentProject?.id, modelUrn]);

  const unlinkElements = useCallback(async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await fetch('/api/weekly-plan/links', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ activityId: selectedId }),
      });
      setLinks(p => { const n = { ...p }; delete n[selectedId]; return n; });
    } finally {
      setSaving(false);
    }
  }, [selectedId]);

  // ── Inline Edit & Reorder ──────────────────────────────────────────────────
  const updateActivityField = useCallback(async (act: Activity, field: keyof Activity, val: any) => {
    if (act[field] === val) return;
    const nextAct = { ...act, [field]: val };
    setActivities(p => p.map(a => a.id === act.id ? nextAct : a));
    try {
      await fetch('/api/weekly-plan/activities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: nextAct.id, title: nextAct.title, discipline: nextAct.discipline,
          startDate: nextAct.start_date, endDate: nextAct.end_date, progress: nextAct.progress,
          wbsEdt: nextAct.wbs_edt, wbsName: nextAct.wbs_name, notes: nextAct.notes, color: nextAct.color,
        }),
      });
    } catch (e) {
      console.error('Save failed', e);
    }
  }, []);

  const handleRowDrop = useCallback(async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    
    setActivities(prev => {
      const oldIdx = prev.findIndex(a => a.id === draggedId);
      const newIdx = prev.findIndex(a => a.id === targetId);
      if (oldIdx === -1 || newIdx === -1) return prev;
      
      const nextActs = [...prev];
      const [moved] = nextActs.splice(oldIdx, 1);
      nextActs.splice(newIdx, 0, moved);
      
      // Sync sort orders in background
      const updates = nextActs.map((a, i) => ({ id: a.id, sort_order: i }));
      fetch('/api/weekly-plan/activities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      }).catch(console.error);
      
      return nextActs;
    });
    setDraggedId(null);
  }, [draggedId]);

  // ── Resize handle ──────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (mv: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setViewerPct(Math.min(80, Math.max(15, Math.round(((mv.clientY - rect.top) / rect.height) * 100))));
    };
    const onUp = () => { dragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  };

  // ── Gantt drag ─────────────────────────────────────────────────────────────
  const onBarMouseDown = useCallback((e: React.MouseEvent, act: Activity, type: 'move' | 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { actId: act.id, type, startX: e.clientX, origStart: act.start_date, origEnd: act.end_date, curStart: act.start_date, curEnd: act.end_date };

    const onMove = (mv: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const deltaDays = Math.round((mv.clientX - d.startX) / PX_PER_DAY);
      const origS = toDate(d.origStart);
      const origE = toDate(d.origEnd);
      let curS = d.origStart, curE = d.origEnd;
      if (d.type === 'move')  { curS = toStr(addDays(origS, deltaDays)); curE = toStr(addDays(origE, deltaDays)); }
      if (d.type === 'start') { curS = toStr(addDays(origS, deltaDays)); if (curS >= d.origEnd) curS = toStr(addDays(origE, -1)); }
      if (d.type === 'end')   { curE = toStr(addDays(origE, deltaDays)); if (curE <= d.origStart) curE = toStr(addDays(origS, 1)); }
      d.curStart = curS;
      d.curEnd   = curE;
      setActivities(p => p.map(a => a.id === d.actId ? { ...a, start_date: curS, end_date: curE } : a));
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      const d = dragRef.current;
      dragRef.current = null;
      if (!d || (d.curStart === d.origStart && d.curEnd === d.origEnd)) return;
      // Save updated dates — use activitiesRef to avoid stale closure
      const act = activitiesRef.current.find(a => a.id === d.actId);
      if (!act) return;
      fetch('/api/weekly-plan/activities', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: d.actId, title: act.title, discipline: act.discipline,
          startDate: d.curStart, endDate: d.curEnd,
          progress: act.progress, wbsEdt: act.wbs_edt, wbsName: act.wbs_name,
          notes: act.notes, color: act.color,
        }),
      }).catch(console.error);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [activities]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const weekEnd    = addDays(weekStart, DAYS - 1);
  const ganttWidth = DAYS * PX_PER_DAY;
  
  // Playback Loop
  useEffect(() => {
    if (!playing) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setCurrentDate(prev => {
        const n = addDays(prev, speed);
        if (n > weekEnd) { setPlaying(false); return weekEnd; }
        return n;
      });
    }, 100);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, speed, weekEnd]);

  // Sync today
  const today      = new Date();
  const todayOff   = daysBetween(weekStart, today);

  // Keep activitiesRef always in sync (needed for drag save without stale closure)
  useEffect(() => { activitiesRef.current = activities; }, [activities]);

  const filtered = useMemo(() => activities.filter(a => !discFilter || a.discipline === discFilter), [activities, discFilter]);
  const selected = activities.find(a => a.id === selectedId) ?? null;

  // ── 4D Colors Evaluation ───────────────────────────────────────────────────
  // We consider "Simulation Mode" active if playing, or if the user has scrubbed to a different date than today.
  const isSimMode = playing || Math.abs(currentDate.getTime() - today.getTime()) > 86400000;

  const { elementColors, doneIds } = useMemo(() => {
    // 1. Planning Mode (Discipline Colors)
    if (!isSimMode) {
      const colors: ElementColor[] = [];
      if (showColors) {
        activities.forEach(act => {
          const actLinks = links[act.id] ?? [];
          if (actLinks.length > 0) {
            const isSelected = act.id === selectedId;
            const hex = act.color || discColor(act.discipline);
            const alpha = selectedId ? (isSelected ? 0.95 : 0.4) : 0.85;
            actLinks.forEach(extId => colors.push({ externalId: extId, hex, alpha }));
          }
        });
      }
      // Basket elements override with amber — visible regardless of showColors
      basket.forEach(extId => {
        // Remove any existing color for this element and replace with basket color
        const idx = colors.findIndex(c => c.externalId === extId);
        const entry: ElementColor = { externalId: extId, hex: '#f59e0b', alpha: 0.98 };
        if (idx >= 0) colors[idx] = entry;
        else colors.push(entry);
      });
      return { elementColors: colors, doneIds: [] };
    }

    // 2. 4D Simulation Mode (Week Colors based on playback date)
    const colors: ElementColor[] = [];
    const done: string[] = [];
    activities.forEach(act => {
      const st = getStatus(act, currentDate);
      if (st === 'not-started') return;
      
      const actLinks = links[act.id] ?? [];
      if (st === 'done') {
        done.push(...actLinks);
      } else {
        const hex = getWeekColor(act.start_date, weekStart);
        actLinks.forEach(extId => colors.push({ externalId: extId, hex, alpha: 0.95 }));
      }
    });
    return { elementColors: colors, doneIds: done };
  }, [activities, links, currentDate, selectedId, isSimMode, weekStart, showColors]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="flex flex-col w-full flex-1 min-h-0 overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-slate-900">

      {/* ── 3D Viewer ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 overflow-hidden" style={{ height: panelMin ? 'calc(100% - 36px)' : `${viewerPct}%` }}>
        <APSViewer4D
          onModelUrnReady={setModelUrn}
          onSelectionChange={handleViewerSelection}
          elementColors={elementColors}
          doneIds={doneIds}
          globalGrey={globalGrey}
        />
      </div>

      {/* ── Resize handle ─────────────────────────────────────────────────── */}
      {!panelMin && (
        <div onMouseDown={onMouseDown} className="shrink-0 h-2 bg-slate-700 hover:bg-blue-600 cursor-row-resize flex items-center justify-center transition-colors group">
          <GripHorizontal className="w-8 h-2 text-slate-500 group-hover:text-white" />
        </div>
      )}

      {/* ── Planning panel ────────────────────────────────────────────────── */}
      <div className={`flex flex-col bg-white min-h-0 ${panelMin ? '' : 'flex-1'}`} style={panelMin ? { height: 36 } : undefined}>

        {/* Toolbar */}
        <div className="shrink-0 flex items-center gap-2 px-3 bg-slate-800 text-white select-none" style={{ height: 36 }}>
          <CalendarDays className="w-3.5 h-3.5 text-blue-300 shrink-0" />
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-200">Planificación Trisemanal</span>

          {!panelMin && (
            <>
              <div className="w-px h-4 bg-slate-600 mx-1" />

              {/* Week navigation */}
              <button onClick={() => setWeekStart(p => addDays(p, -7))} className="text-slate-400 hover:text-white transition-colors"><ChevronLeft className="w-3.5 h-3.5" /></button>
              <span className="text-[11px] text-slate-300 min-w-[160px] text-center">{fmtRange(weekStart, weekEnd)}</span>
              <button onClick={() => setWeekStart(p => addDays(p, 7))}  className="text-slate-400 hover:text-white transition-colors"><ChevronRight className="w-3.5 h-3.5" /></button>
              <button onClick={() => setWeekStart(prevMonday(new Date()))} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">Hoy</button>

              <div className="w-px h-4 bg-slate-600 mx-1" />

              {/* 4D Controls */}
              <button onClick={() => setGlobalGrey(!globalGrey)} title="Toggle Ghost Mode"
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors border ${globalGrey ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50' : 'bg-slate-700 text-slate-400 border-transparent hover:text-white'}`}>
                <Ghost className="w-3.5 h-3.5" /> Ghost
              </button>
              
              <button onClick={() => setShowColors(!showColors)} title="Colorear elementos asignados por disciplina"
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors border ${showColors ? 'bg-amber-500/20 text-amber-500 border-amber-500/50' : 'bg-slate-700 text-slate-400 border-transparent hover:text-white'}`}>
                <Palette className="w-3.5 h-3.5" /> Colores
              </button>

              <div className="w-px h-4 bg-slate-600 mx-1" />

              <button onClick={() => { setPlaying(false); setCurrentDate(new Date(weekStart)); }} title="Ir al inicio" className="text-slate-400 hover:text-white transition-colors">
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setPlaying(!playing)} className="w-5 h-5 flex items-center justify-center rounded-full bg-blue-500 hover:bg-blue-400 text-white transition-colors">
                {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
              </button>

              {/* Speed selector */}
              <div className="flex bg-slate-700 rounded p-0.5 ml-1">
                {SPEEDS.map(s => (
                  <button key={s} onClick={() => setSpeed(s)}
                    className={`px-1 py-0.5 rounded text-[9px] font-bold ${speed === s ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white transition-colors'}`}>
                    {s}d
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 ml-2">
                 <Calendar className="w-3.5 h-3.5 text-slate-400" />
                 <span className="text-[10px] font-mono text-slate-200 min-w-[70px]">
                   {fmtDate(currentDate)}
                 </span>
              </div>

              <div className="flex-1" />

              {/* Selection basket indicator + link/unlink */}
              {basket.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-amber-300 font-semibold">
                    🧺 {basket.length} elem.
                  </span>
                  <button onClick={() => { setBasket([]); setViewerSel([]); }}
                    title="Limpiar cesta" className="text-slate-500 hover:text-red-400 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              {selectedId && basket.length > 0 && (
                <button onClick={linkElements} disabled={saving}
                  className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded bg-blue-500 hover:bg-blue-400 disabled:opacity-40 transition-colors">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                  Vincular {basket.length}
                </button>
              )}
              {!selectedId && basket.length > 0 && (
                <span className="text-[10px] text-slate-400 italic">← selecciona una actividad</span>
              )}
              {selectedId && (links[selectedId]?.length ?? 0) > 0 && (
                <button onClick={unlinkElements} disabled={saving}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-red-500/40 text-red-300 hover:bg-red-500/20 disabled:opacity-40 transition-colors">
                  <Link2Off className="w-3 h-3" /> Desvincular
                </button>
              )}

              {/* New activity */}
              <button
                onClick={() => {
                  setIsNew(true);
                  setSelectedId(null);
                  setEditDraft({ ...emptyActivity(currentProject?.id), id: '__new__' });
                }}
                className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 transition-colors ml-1">
                <Plus className="w-3.5 h-3.5" /> Nueva
              </button>
            </>
          )}

          <button onClick={() => setPanelMin(p => !p)} className="ml-2 text-slate-400 hover:text-white text-[10px] px-2 py-0.5 rounded hover:bg-slate-700 transition-colors">
            {panelMin ? '▲ Expandir' : '▼ Minimizar'}
          </button>
        </div>

        {!panelMin && (
          <div className="flex flex-1 overflow-hidden min-h-0">

            {/* ── Activity list (left, 420px for inline inputs) ─────────── */}
            <div className="flex flex-col shrink-0 border-r border-slate-200 bg-white overflow-hidden" style={{ width: 440 }}>

              {/* Column header */}
              <div className="shrink-0 flex items-center px-3 bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wide" style={{ height: 28 }}>
                <span className="flex-1">Actividades {!loading && `(${filtered.length})`}</span>
                <span className="w-20 text-center mr-1">Inicio</span>
                <span className="w-20 text-center mr-6">Fin</span>
              </div>

              {/* New activity form */}
              {isNew && editDraft && (
                <div className="shrink-0 bg-blue-50 border-b border-blue-200 p-2">
                  <ActivityForm draft={editDraft} onChange={setEditDraft} onSave={() => saveActivity(editDraft)} onCancel={() => { setIsNew(false); setEditDraft(null); }} saving={saving} isNew />
                </div>
              )}

              {/* List */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-16 text-slate-400 text-sm gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-20 text-slate-400 text-xs gap-1">
                    <CalendarDays className="w-5 h-5" />
                    Sin actividades. Haz clic en "+ Nueva"
                  </div>
                ) : filtered.map(act => {
                  const isSelected = act.id === selectedId;
                  const color      = act.color || discColor(act.discipline);
                  const linkCount  = links[act.id]?.length ?? 0;
                  const isEditing  = isSelected && editDraft && !isNew;
                  return (
                    <div key={act.id}
                         draggable
                         onDragStart={(e) => { setDraggedId(act.id); e.dataTransfer.effectAllowed = 'move'; }}
                         onDragOver={(e) => e.preventDefault()}
                         onDrop={(e) => handleRowDrop(e, act.id)}>
                      <div
                        onClick={() => {
                          if (isSelected && isEditing) return;
                          setSelectedId(act.id);
                          setIsNew(false);
                          setEditDraft(null);
                        }}
                        style={{ borderLeft: `3px solid ${color}`, height: ROW_H }}
                        className={`group flex items-center px-1 cursor-pointer select-none transition-colors relative
                          ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}
                          ${draggedId === act.id ? 'opacity-40' : ''}`}>
                        
                        {/* Drag Handle & Bullet Badge */}
                        <div className="flex shrink-0 items-center justify-center w-8 mr-1 text-slate-300 group-hover:text-slate-500 cursor-grab active:cursor-grabbing">
                          <GripHorizontal className="w-3 h-3 mr-1" />
                          {linkCount > 0 ? (
                            <span className="text-[8px] px-1 py-0.5 rounded font-bold text-white shadow-sm" style={{ background: color }}>{linkCount}</span>
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                          )}
                        </div>
                        
                        {/* Discipline Select */}
                        <div className="w-[42px] shrink-0 flex justify-center mr-1">
                          <select
                            value={act.discipline || ''}
                            onChange={e => updateActivityField(act, 'discipline', e.target.value)}
                            onClick={e => e.stopPropagation()}
                            className="w-full text-[7.5px] font-bold text-white bg-transparent outline-none cursor-pointer text-center appearance-none rounded px-0.5 py-0.5 focus:ring-1 focus:ring-white/50"
                            style={{ backgroundColor: discColor(act.discipline) }}
                            title="Cambiar Especialidad"
                          >
                            <option value="" className="text-black bg-white">---</option>
                            {DISCIPLINES.map(d => <option key={d} value={d} className="text-black bg-white">{d.substring(0,3)}</option>)}
                          </select>
                        </div>
                        
                        {/* Title Input */}
                        <input 
                          type="text" 
                          value={act.title || ''}
                          onChange={e => setActivities(p => p.map(a => a.id === act.id ? { ...a, title: e.target.value } : a))}
                          onBlur={e => updateActivityField(act, 'title', e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className="flex-1 text-[10px] font-semibold text-slate-700 truncate pr-2 bg-transparent border border-transparent focus:bg-white focus:border-blue-300 rounded px-1 min-w-[50px]" 
                        />
                        
                        {/* Start Date Input */}
                        <input
                          type="date"
                          value={act.start_date || ''}
                          onChange={e => setActivities(p => p.map(a => a.id === act.id ? { ...a, start_date: e.target.value } : a))}
                          onBlur={e => updateActivityField(act, 'start_date', e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className="w-[72px] text-[9.5px] text-slate-600 bg-transparent border border-transparent hover:border-slate-300 focus:bg-white focus:border-blue-300 rounded px-0.5 py-0.5 transition-colors cursor-text [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer mr-0.5"
                        />
                        
                        {/* End Date Input */}
                        <input
                          type="date"
                          value={act.end_date || ''}
                          onChange={e => setActivities(p => p.map(a => a.id === act.id ? { ...a, end_date: e.target.value } : a))}
                          onBlur={e => updateActivityField(act, 'end_date', e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className="w-[72px] text-[9.5px] text-slate-600 bg-transparent border border-transparent hover:border-slate-300 focus:bg-white focus:border-blue-300 rounded px-0.5 py-0.5 transition-colors cursor-text [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer mr-1"
                        />
                        
                        {/* Actions on Hover OR Link Prompt */}
                        {isSelected && viewerSel.length > 0 ? (
                          <div className="absolute right-1 flex items-center gap-1 bg-white/95 px-1 py-0.5 rounded shadow-sm border border-emerald-300 z-10 transition-all">
                            <button onClick={e => { e.stopPropagation(); linkElements(); }} disabled={saving}
                              className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 hover:bg-emerald-400 text-white transition-colors disabled:opacity-50" title="Guardar elementos seleccionados a esta actividad">
                              {saving ? <Loader2 className="w-3 h-3 animate-spin"/> : <><Check className="w-3 h-3"/> Guardar ({viewerSel.length})</>}
                            </button>
                          </div>
                        ) : (
                          <div className="absolute right-1 hidden group-hover:flex items-center gap-1 bg-white/95 px-1 py-0.5 rounded shadow-sm border border-slate-200 z-10">
                            <button onClick={e => { e.stopPropagation(); deleteActivity(act.id); }}
                              className="text-slate-400 hover:text-red-600 transition-colors p-0.5 rounded" title="Eliminar actividad">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      {/* Inline edit form */}
                      {isSelected && editDraft && !isNew && (
                        <div className="bg-blue-50 border-b border-blue-200 p-2">
                          <ActivityForm draft={editDraft} onChange={setEditDraft}
                            onSave={() => saveActivity(editDraft)}
                            onCancel={() => setEditDraft(null)}
                            saving={saving} isNew={false} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── 3-week Gantt (right) ──────────────────────────────────── */}
            <div className="flex-1 overflow-auto">
              <div style={{ width: ganttWidth, position: 'relative', minHeight: '100%' }}>

                {/* Day headers */}
                <div className="sticky top-0 z-20 flex bg-slate-700 border-b border-slate-600" style={{ height: 28 }}>
                  {Array.from({ length: DAYS }, (_, i) => {
                    const day     = addDays(weekStart, i);
                    const isToday = daysBetween(today, day) === 0;
                    const isSun   = day.getDay() === 0;
                    const isSat   = day.getDay() === 6;
                    return (
                      <div key={i} style={{ width: PX_PER_DAY, minWidth: PX_PER_DAY }}
                        className={`flex flex-col items-center justify-center border-r border-slate-600 text-[9px] font-medium select-none
                          ${isToday ? 'bg-blue-600 text-white' : isSat || isSun ? 'bg-slate-600 text-slate-400' : 'text-slate-300'}`}>
                        <span>{DAY_NAMES[day.getDay()]}</span>
                        <span className="font-bold">{day.getDate()}</span>
                      </div>
                    );
                  })}
                </div>

                {/* 4D Scrubber line integration */}
                <div className="absolute top-0 bottom-0 min-h-full border-l-2 border-red-500 z-10 opacity-60 pointer-events-none"
                     style={{ left: daysBetween(weekStart, currentDate) * PX_PER_DAY, display: Math.abs(daysBetween(weekStart, currentDate)) <= DAYS ? 'block' : 'none' }} />

                {/* Activity rows */}
                {filtered.map((act, idx) => {
                  const color    = act.color || discColor(act.discipline);
                  const isSelected = act.id === selectedId;
                  const isDirty  = dirtyIds.has(act.id);
                  const s = toDate(act.start_date);
                  const e = toDate(act.end_date);
                  const barLeft  = daysBetween(weekStart, s) * PX_PER_DAY;
                  const barWidth = Math.max(PX_PER_DAY * 0.5, daysBetween(s, addDays(e, 1)) * PX_PER_DAY);

                  const clampLeft  = Math.max(0, barLeft);
                  const clampRight = Math.min(ganttWidth, barLeft + barWidth);
                  const visible    = clampRight > clampLeft;

                  return (
                    <div key={act.id}
                      onClick={() => setSelectedId(act.id)}
                      className={`relative flex items-center border-b border-slate-100 cursor-pointer
                        ${isSelected ? 'bg-blue-50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}
                        hover:bg-blue-50/50 transition-colors`}
                      style={{ height: ROW_H }}>

                      {/* Weekend shading */}
                      {Array.from({ length: DAYS }, (_, i) => {
                        const day = addDays(weekStart, i);
                        const wd  = day.getDay();
                        if (wd !== 0 && wd !== 6) return null;
                        return <div key={i} className="absolute top-0 bottom-0 bg-slate-100/60 pointer-events-none" style={{ left: i * PX_PER_DAY, width: PX_PER_DAY }} />;
                      })}

                      {/* Selection background highlight */}
                      {isSelected && <div className="absolute inset-0 bg-blue-50/50 pointer-events-none" />}

                      {/* Dirty Indicator / Save Button Overlay */}
                      {isDirty && (
                        <div className="absolute left-0 h-full flex items-center px-1 z-30 pointer-events-none">
                          <div className="flex items-center gap-0.5 pointer-events-auto">
                            <button 
                              onClick={e => { e.stopPropagation(); saveActivity(act); setDirtyIds(p => { const n = new Set(p); n.delete(act.id); return n; }); }}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white p-1 rounded-sm shadow-lg flex items-center gap-1 text-[8.5px] font-bold h-5 uppercase transition-transform active:scale-95">
                              <Check className="w-3 h-3"/> Guardar
                            </button>
                            <button 
                              onClick={e => { 
                                e.stopPropagation(); 
                                setDirtyIds(p => { const n = new Set(p); n.delete(act.id); return n; });
                                load(); // Revert by reloading from DB
                              }}
                              className="bg-slate-500 hover:bg-slate-400 text-white p-1 rounded-sm shadow-lg h-5 transition-transform active:scale-95">
                              <X className="w-3 h-3"/>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Gantt bar */}
                      {visible && (
                        <div
                          className="absolute rounded select-none cursor-grab active:cursor-grabbing"
                          style={{
                            left:            clampLeft,
                            width:           clampRight - clampLeft,
                            top:             7,
                            height:          20,
                            background:      color,
                            opacity:         isSelected ? 1 : 0.82,
                            boxShadow:       isSelected ? `0 0 0 2px white, 0 0 0 3px ${color}` : undefined,
                          }}
                          onMouseDown={e => onBarMouseDown(e, act, 'move')}
                        >
                          {/* Left resize handle */}
                          {barLeft >= 0 && (
                            <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize"
                              style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '3px 0 0 3px' }}
                              onMouseDown={e => onBarMouseDown(e, act, 'start')} />
                          )}
                          {/* Progress fill */}
                          {act.progress > 0 && (
                            <div className="absolute inset-y-0 left-2 rounded bg-black/20"
                              style={{ width: `calc(${act.progress}% - 8px)` }} />
                          )}
                          {/* Label inside bar */}
                          <span className="absolute inset-0 flex items-center px-2 text-[9.5px] font-bold text-white truncate pointer-events-none drop-shadow-sm">
                            {barWidth > 60 ? act.title : ''}
                          </span>
                          {/* Right resize handle */}
                          {barLeft + barWidth <= ganttWidth && (
                            <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize"
                              style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '0 3px 3px 0' }}
                              onMouseDown={e => onBarMouseDown(e, act, 'end')} />
                          )}
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

// ── Activity edit form ─────────────────────────────────────────────────────────
function ActivityForm({ draft, onChange, onSave, onCancel, saving, isNew }: {
  draft:    Partial<Activity>;
  onChange: (d: Partial<Activity>) => void;
  onSave:   () => void;
  onCancel: () => void;
  saving:   boolean;
  isNew:    boolean;
}) {
  const set = (k: keyof Activity, v: any) => onChange({ ...draft, [k]: v });
  return (
    <div className="flex flex-col gap-1.5 text-[11px]">
      <input
        placeholder="Título de la actividad *"
        value={draft.title ?? ''}
        onChange={e => set('title', e.target.value)}
        className="w-full px-2 py-1 rounded border border-blue-300 bg-white text-slate-800 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <div className="flex gap-1.5">
        <select value={draft.discipline ?? 'Civil'} onChange={e => set('discipline', e.target.value)}
          className="flex-1 px-2 py-1 rounded border border-blue-200 bg-white text-slate-700 text-[11px]">
          {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <input type="number" min={0} max={100} value={draft.progress ?? 0}
          onChange={e => set('progress', Number(e.target.value))}
          className="w-14 px-2 py-1 rounded border border-blue-200 bg-white text-slate-700 text-[11px]"
          title="Avance %" />
        <span className="flex items-center text-slate-500 text-[10px]">%</span>
      </div>
      <div className="flex gap-1.5">
        <div className="flex flex-col gap-0.5 flex-1">
          <span className="text-[9px] text-slate-500 uppercase tracking-wide">Inicio</span>
          <input type="date" value={draft.start_date ?? ''} onChange={e => set('start_date', e.target.value)}
            className="px-2 py-1 rounded border border-blue-200 bg-white text-slate-700 text-[11px]" />
        </div>
        <div className="flex flex-col gap-0.5 flex-1">
          <span className="text-[9px] text-slate-500 uppercase tracking-wide">Fin</span>
          <input type="date" value={draft.end_date ?? ''} onChange={e => set('end_date', e.target.value)}
            className="px-2 py-1 rounded border border-blue-200 bg-white text-slate-700 text-[11px]" />
        </div>
      </div>
      <input placeholder="EDT del WBS (opcional)"
        value={draft.wbs_edt ?? ''} onChange={e => set('wbs_edt', e.target.value)}
        className="w-full px-2 py-1 rounded border border-blue-200 bg-white text-slate-700 text-[11px]" />
      <div className="flex gap-1.5 justify-end mt-0.5">
        <button onClick={onCancel} className="flex items-center gap-1 px-2 py-1 rounded text-slate-500 hover:bg-slate-100 transition-colors">
          <X className="w-3 h-3" /> Cancelar
        </button>
        <button onClick={onSave} disabled={saving || !draft.title?.trim()}
          className="flex items-center gap-1 px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors font-medium">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          {isNew ? 'Crear' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
