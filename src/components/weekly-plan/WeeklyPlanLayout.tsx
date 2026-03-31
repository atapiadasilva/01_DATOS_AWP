'use client';

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Plus, Trash2, Link2, Link2Off, ChevronLeft, ChevronRight, ChevronDown,
  GripHorizontal, CalendarDays, Loader2, Check, X,
  Play, Pause, SkipBack, Ghost, Calendar, Palette, Maximize2,
} from 'lucide-react';
import APSViewer4D, { type APSViewer4DHandle, type TreeNodeInfo } from '@/components/viewer3d/APSViewer4D';
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
  const [viewerPct, setViewerPct] = useState(52);
  const [panelMin,  setPanelMin]  = useState(false);

  // Data
  const [activities, setActivities] = useState<Activity[]>([]);
  const [links,      setLinks]      = useState<Record<string, string[]>>({});
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);

  // Selection / edit
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()); // multi-select
  const [multiSelect, setMultiSelect] = useState(false);
  const [editDraft,   setEditDraft]   = useState<Partial<Activity> | null>(null);
  const [isNew,       setIsNew]       = useState(false);
  const [discFilter,    setDiscFilter]    = useState<string>('');
  const [treeNodes,     setTreeNodes]     = useState<{ id: number; name: string }[]>([]);
  const [filterNodeIds, setFilterNodeIds] = useState<Set<number>>(new Set()); // nodos del árbol seleccionados
  const [showNodePanel, setShowNodePanel] = useState(false); // toggle del panel de checkboxes
  const [treeNavPath,   setTreeNavPath]   = useState<{ id: number; name: string }[]>([]); // breadcrumb
  const [treeNavNodes,  setTreeNavNodes]  = useState<TreeNodeInfo[]>([]); // nodos en nivel actual
  const [draggedId,   setDraggedId]   = useState<string | null>(null);
  const [showAssigned,   setShowAssigned]   = useState(false); // colorear vinculados en verde
  const [isolateAssigned, setIsolateAssigned] = useState(true); // aislar: mostrar solo vinculados
  const [hiddenIds,      setHiddenIds]      = useState<string[]>([]); // elementos ocultos manualmente
  const [dirtyIds,       setDirtyIds]       = useState<Set<string>>(new Set());
  const [collapsedDiscs, setCollapsedDiscs] = useState<Set<string>>(new Set());

  // Viewer
  const [modelUrn,  setModelUrn]  = useState('');
  const [viewerSel, setViewerSel] = useState<string[]>([]); // current APS selection
  const [basket,    setBasket]    = useState<string[]>([]); // accumulated for linking
  const [chipSel,      setChipSel]      = useState<string | null>(null); // chip clicked → select in viewer
  const [showChips,    setShowChips]    = useState(false);              // toggle chip panel
  const [pendingRemove, setPendingRemove] = useState<Set<string>>(new Set()); // marked for removal
  const basketRef      = useRef<string[]>([]);               // always-fresh basket for linkElements
  const activitiesRef  = useRef<Activity[]>([]);             // always-fresh ref for drag save
  const linkedSetRef   = useRef<Set<string>>(new Set());     // always-fresh for handleViewerSelection
  const multiSelectRef = useRef<boolean>(false);             // always-fresh for handleViewerSelection
  const viewerApiRef   = useRef<APSViewer4DHandle>(null);    // imperative viewer API

  // 3-week window
  const [weekStart, setWeekStart] = useState<Date>(() => prevMonday(new Date()));

  // 4D Playback
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playing,     setPlaying]     = useState(false);
  const [speed,       setSpeed]       = useState<typeof SPEEDS[number]>(1);
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

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

  // ── Viewer selection → basket ─────────────────────────────────────────────
  // Multi OFF: cada click REEMPLAZA el basket (solo el último queda naranja)
  // Multi ON:  cada click ACUMULA en el basket
  // Clic en espacio vacío (extIds=[]) no toca el basket en ningún modo
  const handleViewerSelection = useCallback((extIds: string[]) => {
    setViewerSel(extIds);
    if (extIds.length > 0) {
      if (multiSelectRef.current) {
        setBasket(prev => Array.from(new Set([...prev, ...extIds])));
      } else {
        setBasket(extIds); // reemplaza: solo el último elemento queda naranja
      }
      // Bidireccional: si el elemento clickeado está vinculado → resalta su chip
      const linked = extIds.find(id => linkedSetRef.current.has(id));
      if (linked) { setChipSel(linked); setShowChips(true); }
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
      const res = await fetch('/api/weekly-plan/activities', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const raw = await res.json();
      if (!res.ok) { console.error('[saveActivity] API error:', raw); return; }
      // Normalize ISO dates → YYYY-MM-DD
      const data = { ...raw, start_date: raw.start_date?.split('T')[0] ?? raw.start_date, end_date: raw.end_date?.split('T')[0] ?? raw.end_date };
      if (isNew) {
        setActivities(p => [...p, data]);
        setSelectedId(data.id);
        setSelectedIds(new Set([data.id]));
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
  // Uses basketRef.current so it ALWAYS reads the full up-to-date basket,
  // even if called before React's next render cycle (avoids stale closure).
  const linkElements = useCallback(async () => {
    const currentBasket = basketRef.current;
    if (!selectedId || !currentBasket.length || !currentProject?.id || !modelUrn) return;
    setSaving(true);
    try {
      const res = await fetch('/api/weekly-plan/links', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          activityId: selectedId,
          projectId:  currentProject.id,
          modelUrn,
          externalIds: currentBasket,
        }),
      });
      const result = await res.json();
      if (!res.ok) { console.error('[linkElements] API error:', result); return; }
      // Merge into local links state
      setLinks(p => ({
        ...p,
        [selectedId]: Array.from(new Set([...(p[selectedId] ?? []), ...currentBasket])),
      }));
      setBasket([]);    // clear basket after successful link
      setViewerSel([]); // deselect in viewer
    } catch (e) {
      console.error('[linkElements] fetch error:', e);
    } finally {
      setSaving(false);
    }
  }, [selectedId, currentProject?.id, modelUrn]); // basket removed from deps — uses ref instead

  // Desvincular TODOS los elementos de la actividad seleccionada
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
    // No early-return: the onChange already updated local state before onBlur fires,
    // so act[field] === val would always be true for text inputs and skip the save.
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
      setViewerPct(Math.min(85, Math.max(20, Math.round(((mv.clientY - rect.top) / rect.height) * 100))));
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

  // Keep refs always in sync (avoids stale closures in async callbacks)
  useEffect(() => { activitiesRef.current  = activities;  }, [activities]);
  useEffect(() => { basketRef.current      = basket;      }, [basket]);
  useEffect(() => { multiSelectRef.current = multiSelect; }, [multiSelect]);

  const filtered = useMemo(() => activities.filter(a => !discFilter || a.discipline === discFilter), [activities, discFilter]);
  const selected = activities.find(a => a.id === selectedId) ?? null;

  // ── Basket / link intersection — used by toolbar buttons ─────────────────
  const currentLinks = useMemo(
    () => (selectedId ? (links[selectedId] ?? []) : []),
    [selectedId, links],
  );
  const linkedSet    = useMemo(() => new Set(currentLinks), [currentLinks]);
  // Sync linkedSetRef for use in handleViewerSelection (avoids stale closure)
  useEffect(() => { linkedSetRef.current = linkedSet; }, [linkedSet]);
  // Reset chip UI when selected activity changes
  useEffect(() => { setChipSel(null); setShowChips(false); setPendingRemove(new Set()); }, [selectedId]);
  // basket items that are ALREADY linked → Desvincular
  const basketLinked = useMemo(() => basket.filter(id => linkedSet.has(id)), [basket, linkedSet]);
  // basket items NOT yet linked → Vincular
  const basketNew    = useMemo(() => basket.filter(id => !linkedSet.has(id)), [basket, linkedSet]);

  // Marcar / desmarcar un chip para eliminación (no borra hasta confirmar)
  const togglePending = useCallback((extId: string) => {
    setPendingRemove(p => {
      const n = new Set(p);
      n.has(extId) ? n.delete(extId) : n.add(extId);
      return n;
    });
  }, []);

  // Confirmar eliminación de todos los chips marcados
  const savePendingRemovals = useCallback(async () => {
    if (!selectedId || pendingRemove.size === 0) return;
    const toRemove = Array.from(pendingRemove);
    setSaving(true);
    try {
      const res = await fetch('/api/weekly-plan/links', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ activityId: selectedId, externalIds: toRemove }),
      });
      if (!res.ok) { console.error('[savePendingRemovals]', await res.json()); return; }
      setLinks(p => ({
        ...p,
        [selectedId]: (p[selectedId] ?? []).filter(id => !toRemove.includes(id)),
      }));
      setPendingRemove(new Set());
      setChipSel(null);
    } finally {
      setSaving(false);
    }
  }, [selectedId, pendingRemove]);

  // Desvincular SOLO los elementos del basket que ya están vinculados a la actividad.
  const unlinkSpecific = useCallback(async () => {
    if (!selectedId) return;
    const toRemove = basketRef.current.filter(id => linkedSet.has(id));
    if (!toRemove.length) return;
    setSaving(true);
    try {
      const res = await fetch('/api/weekly-plan/links', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ activityId: selectedId, externalIds: toRemove }),
      });
      if (!res.ok) { console.error('[unlinkSpecific]', await res.json()); return; }
      setLinks(p => ({
        ...p,
        [selectedId]: (p[selectedId] ?? []).filter(id => !toRemove.includes(id)),
      }));
      setBasket([]);
      setViewerSel([]);
    } finally {
      setSaving(false);
    }
  }, [selectedId, linkedSet]);

  // ── Tree navigation ────────────────────────────────────────────────────────
  const loadTreeNavNodes = useCallback((nodeId: number | null) => {
    const nodes = viewerApiRef.current?.getNodeChildren(nodeId) ?? [];
    setTreeNavNodes(nodes);
  }, []);

  // When model tree arrives, load root-level nav nodes
  useEffect(() => {
    if (treeNodes.length > 0) loadTreeNavNodes(null);
  }, [treeNodes, loadTreeNavNodes]);

  const enterTreeFolder = useCallback((node: TreeNodeInfo) => {
    setTreeNavPath(p => [...p, { id: node.id, name: node.name }]);
    loadTreeNavNodes(node.id);
  }, [loadTreeNavNodes]);

  const goTreeUp = useCallback(() => {
    setTreeNavPath(p => {
      const next = p.slice(0, -1);
      const parentId = next.length > 0 ? next[next.length - 1].id : null;
      loadTreeNavNodes(parentId);
      return next;
    });
  }, [loadTreeNavNodes]);

  const toggleNodeFilter = useCallback((nodeId: number) => {
    setFilterNodeIds(prev => {
      const n = new Set(prev);
      n.has(nodeId) ? n.delete(nodeId) : n.add(nodeId);
      return n;
    });
  }, []);

  // ── Group by discipline ────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, Activity[]>();
    filtered.forEach(act => {
      const d = act.discipline || 'General';
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(act);
    });
    return Array.from(map.entries()).map(([discipline, acts]) => ({ discipline, acts }));
  }, [filtered]);

  // Todos los externalIds vinculados a cualquier actividad (para Ocultar/Aislar)
  const allAssignedIds = useMemo(() => {
    const ids = new Set<string>();
    activities.forEach(act => (links[act.id] ?? []).forEach(id => ids.add(id)));
    return Array.from(ids);
  }, [activities, links]);

  const allAssignedSet  = useMemo(() => new Set(allAssignedIds), [allAssignedIds]);
  const assignedAreHidden = allAssignedIds.length > 0 && allAssignedIds.every(id => hiddenIds.includes(id));

  // IDs de elementos vinculados a las actividades chequeadas (solo cuando multiSelect ON)
  // El row-click (selectedId) NO afecta al viewer — solo sirve para el panel de edición
  const checkedLinks = useMemo(() => {
    if (!multiSelect || selectedIds.size === 0) return [];
    const ids: string[] = [];
    selectedIds.forEach(actId => ids.push(...(links[actId] ?? [])));
    return ids;
  }, [multiSelect, selectedIds, links]);

  // Solo el Play activa el modo 4D progresivo — el scrubbing manual mantiene vista estática
  const is4DMode = playing;

  const { elementColors, doneIds } = useMemo(() => {
    const visibleActs = discFilter ? activities.filter(a => a.discipline === discFilter) : activities;

    // Helper: aplica basket naranja encima
    const applyBasket = (colors: ElementColor[]) => {
      basket.forEach(extId => {
        const idx = colors.findIndex(c => c.externalId === extId);
        const entry: ElementColor = { externalId: extId, hex: '#f59e0b', alpha: 0.98 };
        if (idx >= 0) colors[idx] = entry; else colors.push(entry);
      });
    };

    // Aplica highlight naranja para los chequeados (encima de cualquier otro color)
    const applyChecked = (colors: ElementColor[]) => {
      checkedLinks.forEach(extId => {
        const idx = colors.findIndex(c => c.externalId === extId);
        const entry: ElementColor = { externalId: extId, hex: '#f97316', alpha: 0.99 };
        if (idx >= 0) colors[idx] = entry; else colors.push(entry);
      });
    };

    // Todos los IDs vinculados (para modo estático)
    const allLinkedIds = Array.from(new Set(
      visibleActs.flatMap(act => links[act.id] ?? [])
    ));

    // ── MODO 4D (Play o scrub activo) ────────────────────────────────────────
    // Progresivo: elementos aparecen conforme avanza la fecha
    if (is4DMode) {
      const colors: ElementColor[] = [];
      const done: string[] = [];
      visibleActs.forEach(act => {
        const st = getStatus(act, currentDate);
        if (st === 'not-started') return; // aún no aparece
        const actLinks = links[act.id] ?? [];
        if (!showAssigned) {
          // Color OFF: visible con color original
          done.push(...actLinks);
        } else {
          // Color ON: verde progresivo
          actLinks.forEach(extId => colors.push({ externalId: extId, hex: '#22c55e', alpha: 0.85 }));
        }
      });
      applyChecked(colors);
      applyBasket(colors);
      // En Aislar ON: strictIsolate hace que los no-asignados queden ghosteados
      // colors vacío al inicio → modelo vacío (strictIsolate)
      return { elementColors: colors, doneIds: done };
    }

    // ── MODO ESTÁTICO (sin play) ──────────────────────────────────────────────

    // Checkbox activo → highlight naranja de los chequeados
    if (checkedLinks.length > 0) {
      if (isolateAssigned) {
        const colors: ElementColor[] = checkedLinks.map(extId => ({
          externalId: extId, hex: '#f97316', alpha: 0.99,
        }));
        applyBasket(colors);
        return { elementColors: colors, doneIds: [] };
      }
      // Aislar OFF: todos verdes + chequeados naranjas encima
      if (showAssigned) {
        const colors: ElementColor[] = allLinkedIds.map(extId => ({
          externalId: extId, hex: '#22c55e', alpha: 0.6,
        }));
        applyChecked(colors);
        applyBasket(colors);
        return { elementColors: colors, doneIds: [] };
      }
      const colors: ElementColor[] = [];
      applyChecked(colors);
      applyBasket(colors);
      return { elementColors: colors, doneIds: [] };
    }

    // Sin checkbox: Color ON → verde para todos | Color OFF → modelo vacío (nada construido)
    if (showAssigned) {
      const alpha = isolateAssigned ? 0.85 : 0.6;
      const colors: ElementColor[] = allLinkedIds.map(extId => ({
        externalId: extId, hex: '#22c55e', alpha,
      }));
      applyBasket(colors);
      return { elementColors: colors, doneIds: [] };
    } else {
      // Color OFF + Aislar ON → modelo vacío (strictIsolate con assigned=[] → blank)
      // Color OFF + Aislar OFF → modelo completo sin theming
      return { elementColors: [], doneIds: [] };
    }
  }, [activities, links, currentDate, checkedLinks, showAssigned, isolateAssigned, basket, discFilter, is4DMode]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="flex flex-col w-full flex-1 min-h-0 overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-slate-900">

      {/* ── 3D Viewer Area ────────────────────────────────────────────────── */}
      <div className="shrink-0 overflow-hidden flex flex-row relative" style={{ height: panelMin ? 'calc(100% - 36px)' : `${viewerPct}%` }}>

        {/* Panel lateral de filtros por disciplina (Sidebar) */}
        {treeNodes.length > 0 && (
          <div className={`shrink-0 flex flex-col bg-black/40 border-r border-white/10 transition-all duration-300 z-10 relative
            ${showNodePanel ? 'w-[260px]' : 'w-10'}`}>
            
            {/* Header del Panel Lateral */}
            <div className={`h-10 flex items-center border-b border-white/10 shrink-0 ${showNodePanel ? 'px-3 justify-between' : 'justify-center'}`}>
              {showNodePanel ? (
                <>
                  <div className="flex items-center gap-1.5 text-slate-200 font-bold text-[11px] truncate select-none">
                    🗂 Filtro Disciplinas
                    {filterNodeIds.size > 0 && (
                      <span className="bg-blue-600 px-1.5 py-0.5 rounded text-[9px] text-white ml-1">{filterNodeIds.size}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {filterNodeIds.size > 0 && (
                      <button onClick={() => setFilterNodeIds(new Set())} className="text-slate-400 hover:text-red-400 p-1 rounded hover:bg-white/10" title="Limpiar filtros">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => setShowNodePanel(false)} className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/10" title="Contraer panel">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => setShowNodePanel(true)}
                  className="w-full h-full flex flex-col items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                  title="Expandir filtro por disciplinas"
                >
                  <div className="relative">
                    <ChevronRight className="w-4 h-4" />
                    {filterNodeIds.size > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />}
                  </div>
                </button>
              )}
            </div>

            {/* Contenido Desplegable (Árbol) */}
            {showNodePanel && (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Header con breadcrumb */}
                <div className="px-2 py-1.5 bg-black/20 border-b border-white/10 flex items-center gap-1 shrink-0">
                  {treeNavPath.length > 0 && (
                    <button onClick={goTreeUp} className="text-slate-400 hover:text-white shrink-0 p-0.5 rounded hover:bg-white/10" title="Subir nivel">
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <span className="text-[10px] font-bold text-slate-300 flex-1 truncate select-none">
                    {treeNavPath.length > 0 ? treeNavPath[treeNavPath.length - 1].name : 'Estructura Completa'}
                  </span>
                </div>

                {/* Nodos del nivel actual */}
                <div className="flex-1 overflow-y-auto p-1">
                  {treeNavNodes.length === 0 && (
                    <div className="px-3 py-2 text-[10px] text-slate-500 italic">Sin elementos en este nivel</div>
                  )}
                  {treeNavNodes.map(node => {
                    const checked = filterNodeIds.has(node.id);
                    return (
                      <div key={node.id}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded transition-colors select-none mb-0.5
                          ${checked ? 'bg-blue-600/30 text-white' : 'text-slate-300 hover:bg-white/5'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleNodeFilter(node.id)}
                          className="accent-blue-400 w-3.5 h-3.5 shrink-0 cursor-pointer"
                        />
                        <span
                          className="text-[11px] font-medium flex-1 truncate cursor-pointer"
                          onClick={() => toggleNodeFilter(node.id)}
                          title={node.name}>
                          {node.name}
                        </span>
                        {node.childCount > 0 && !node.name.includes('.') && (
                          <span className="text-[9px] text-slate-500 shrink-0 bg-black/30 px-1 rounded">{node.childCount}</span>
                        )}
                        {node.hasChildren && (
                          <button
                            onClick={() => enterTreeFolder(node)}
                            className="text-slate-400 hover:text-white shrink-0 p-1 rounded hover:bg-white/10 ml-1"
                            title="Ver contenido de la carpeta">
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 relative min-w-0">
          <APSViewer4D
            ref={viewerApiRef}
            onModelUrnReady={setModelUrn}
            onSelectionChange={handleViewerSelection}
            onModelTreeReady={setTreeNodes}
            elementColors={elementColors}
            doneIds={doneIds}
            globalGrey={isolateAssigned}
            strictIsolate={isolateAssigned}
            selection={chipSel ? [chipSel] : undefined}
            nodeFilterIds={Array.from(filterNodeIds)}
            hiddenIds={hiddenIds}
          />
        </div>
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

              {/* Multi-select toggle */}
              <label className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition-colors border select-none
                ${multiSelect ? 'bg-violet-500/20 text-violet-300 border-violet-500/50' : 'bg-slate-700 text-slate-400 border-transparent hover:text-white'}`}>
                <input type="checkbox" checked={multiSelect}
                  onChange={e => {
                    setMultiSelect(e.target.checked);
                    if (!e.target.checked) setSelectedIds(selectedId ? new Set([selectedId]) : new Set());
                  }}
                  className="accent-violet-400 w-3 h-3" />
                Multi
                {multiSelect && selectedIds.size > 1 && (
                  <span className="font-bold text-violet-200">({selectedIds.size})</span>
                )}
              </label>

              {/* ── Vinculados group ── */}
              <div className="flex items-center bg-slate-700/60 border border-slate-600 rounded overflow-hidden">
                <span className="px-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wide border-r border-slate-600 select-none">Vinc.</span>

                {/* Color toggle */}
                <button
                  onClick={() => setShowAssigned(p => !p)}
                  title={showAssigned ? 'Apagar color verde (vinculados)' : 'Encender color verde (vinculados)'}
                  className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] transition-colors border-r border-slate-600
                    ${showAssigned ? 'bg-emerald-500/25 text-emerald-300' : 'text-slate-500 hover:text-slate-200'}`}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: showAssigned ? '#22c55e' : '#475569' }} />
                  Color
                </button>

                {/* Ocultar / Mostrar todos los vinculados */}
                <button
                  onClick={() => {
                    if (assignedAreHidden) {
                      setHiddenIds(prev => prev.filter(id => !allAssignedSet.has(id)));
                    } else {
                      setHiddenIds(prev => Array.from(new Set([...prev, ...allAssignedIds])));
                    }
                  }}
                  title={assignedAreHidden ? 'Mostrar vinculados en el visor' : 'Ocultar vinculados del visor'}
                  className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] transition-colors
                    ${assignedAreHidden ? 'bg-red-500/20 text-red-300' : 'text-slate-500 hover:text-slate-200'}`}>
                  {assignedAreHidden ? '👁 Mostrar' : '🚫 Ocultar'}
                </button>
              </div>

              {/* Aislar: ON = solo vinculados (ghost resto) | OFF = modelo completo */}
              <button
                onClick={() => setIsolateAssigned(p => !p)}
                title={isolateAssigned ? 'Mostrar modelo completo' : 'Aislar: mostrar solo elementos vinculados'}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-all border
                  ${isolateAssigned
                    ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                    : 'bg-slate-700 text-slate-300 border-slate-500 hover:bg-slate-600 hover:text-white'}`}>
                <Ghost className="w-3.5 h-3.5" />
                Aislar
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

              {/* ── Basket counter + clear ── */}
              {basket.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-amber-300 font-semibold">
                    🧺 {basket.length}
                    {selectedId && basketLinked.length > 0 && basketNew.length > 0 && (
                      <span className="text-slate-400 font-normal ml-0.5">
                        ({basketNew.length}↑ {basketLinked.length}↓)
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => viewerApiRef.current?.zoomToElements(basket)}
                    title="Zoom a los elementos seleccionados"
                    className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-500/50 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors">
                    <Maximize2 className="w-3 h-3" /> Zoom ({basket.length})
                  </button>
                  <button
                    onClick={() => {
                      setHiddenIds(prev => Array.from(new Set([...prev, ...basket])));
                      setBasket([]);
                      setViewerSel([]);
                    }}
                    title="Ocultar los elementos seleccionados del visor"
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-slate-500 text-slate-300 hover:border-red-400 hover:text-red-300 transition-colors">
                    👁‍🗨 Ocultar
                  </button>
                  <button
                    onClick={() => { setBasket([]); setViewerSel([]); setChipSel(null); }}
                    title="Limpiar basket"
                    className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border border-slate-600 text-slate-400 hover:border-red-400 hover:text-red-400 transition-colors">
                    <X className="w-3 h-3" /> Limpiar
                  </button>
                </div>
              )}

              {/* Elementos ocultos — botón para restaurar */}
              {hiddenIds.length > 0 && (
                <button
                  onClick={() => setHiddenIds([])}
                  title="Mostrar todos los elementos ocultos"
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-slate-500 text-slate-400 hover:border-emerald-400 hover:text-emerald-300 transition-colors">
                  👁 Mostrar ({hiddenIds.length})
                </button>
              )}

              {/* Sin actividad → aviso */}
              {!selectedId && basket.length > 0 && (
                <span className="text-[10px] text-slate-400 italic">← selecciona actividad</span>
              )}

              {/* Vincular elementos nuevos */}
              {selectedId && basketNew.length > 0 && (
                <button onClick={linkElements} disabled={saving}
                  className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded bg-blue-500 hover:bg-blue-400 disabled:opacity-40 transition-colors">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                  Vincular {basketNew.length}
                </button>
              )}

              {/* Desvincular elementos seleccionados que ya están vinculados */}
              {selectedId && basketLinked.length > 0 && (
                <button onClick={unlinkSpecific} disabled={saving}
                  className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded bg-orange-500/20 border border-orange-500/50 text-orange-300 hover:bg-orange-500/40 disabled:opacity-40 transition-colors">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2Off className="w-3 h-3" />}
                  Desvincular {basketLinked.length}
                </button>
              )}

              {/* Desvincular todo (sin basket activo) */}
              {selectedId && basket.length === 0 && currentLinks.length > 0 && (
                <button onClick={unlinkElements} disabled={saving}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-red-500/40 text-red-300 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
                  title="Eliminar todos los vínculos de esta actividad">
                  <Link2Off className="w-3 h-3" /> Todo ({currentLinks.length})
                </button>
              )}

              {/* New activity */}
              <button
                onClick={() => {
                  setIsNew(true);
                  setSelectedId(null);
                  setSelectedIds(new Set());
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
          /* ── Unified scroll container: rows span both left data + gantt ── */
          <div className="flex-1 overflow-auto min-h-0">
            <div style={{ minWidth: 440 + ganttWidth }}>

              {/* ── Sticky header row ─────────────────────────────────────── */}
              <div className="sticky top-0 z-20 flex border-b border-slate-200">
                {/* Left column header */}
                <div className="shrink-0 flex items-center px-3 bg-slate-50 border-r border-slate-300 text-[10px] font-semibold text-slate-500 uppercase tracking-wide" style={{ width: 440, height: 28 }}>
                  <span className="flex-1">Actividades {!loading && `(${filtered.length})`}</span>
                  <span className="w-20 text-center mr-1">Inicio</span>
                  <span className="w-20 text-center mr-4">Fin</span>
                </div>
                {/* Day headers */}
                <div className="flex bg-slate-700" style={{ height: 28 }}>
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
              </div>

              {/* ── New activity form row ──────────────────────────────────── */}
              {isNew && editDraft && (
                <div className="flex bg-blue-50 border-b border-blue-200">
                  <div className="shrink-0 p-2 border-r border-blue-200" style={{ width: 440 }}>
                    <ActivityForm draft={editDraft} onChange={setEditDraft} onSave={() => saveActivity(editDraft)} onCancel={() => { setIsNew(false); setEditDraft(null); }} saving={saving} isNew />
                  </div>
                  <div className="flex-1" />
                </div>
              )}

              {/* ── Loading / Empty states ─────────────────────────────────── */}
              {loading && (
                <div className="flex items-center justify-center h-16 text-slate-400 text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
                </div>
              )}
              {!loading && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center h-20 text-slate-400 text-xs gap-1">
                  <CalendarDays className="w-5 h-5" />
                  Sin actividades. Haz clic en "+ Nueva"
                </div>
              )}

              {/* ── Activity rows grouped by discipline ────────────────────── */}
              {grouped.map(({ discipline, acts: groupActs }) => {
                const isCollapsed  = collapsedDiscs.has(discipline);
                const dColor       = discColor(discipline);
                const linkedInGroup = groupActs.reduce((s, a) => s + (links[a.id]?.length ?? 0), 0);

                return (
                  <div key={discipline}>
                    {/* ── Discipline group header ── */}
                    <div
                      className="flex border-b border-slate-300 bg-slate-100 cursor-pointer select-none hover:bg-slate-200 transition-colors"
                      style={{ height: 24 }}
                      onClick={() => setCollapsedDiscs(p => {
                        const n = new Set(p);
                        n.has(discipline) ? n.delete(discipline) : n.add(discipline);
                        return n;
                      })}>
                      <div
                        className="shrink-0 flex items-center gap-1.5 px-2 border-r border-slate-300"
                        style={{ width: 440, borderLeft: `3px solid ${dColor}` }}>
                        {isCollapsed
                          ? <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                          : <ChevronDown  className="w-3 h-3 text-slate-500 shrink-0" />}
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dColor }} />
                        <span className="text-[10px] font-bold text-slate-700 truncate">{discipline || 'General'}</span>
                        <span className="text-[9px] text-slate-400 shrink-0">({groupActs.length})</span>
                        {linkedInGroup > 0 && (
                          <span className="text-[9px] text-emerald-600 font-semibold shrink-0">· {linkedInGroup} vinc.</span>
                        )}
                      </div>
                      <div className="flex-1 bg-slate-100/80" />
                    </div>

                    {/* ── Rows for this discipline (hidden when collapsed) ── */}
                    {!isCollapsed && (
                    <>{groupActs.map((act, idx) => {
                const color      = act.color || discColor(act.discipline);
                const isSelected = selectedIds.has(act.id);
                const isPrimary  = act.id === selectedId; // primary selection (chip panel, toolbar ops)
                const isDirty    = dirtyIds.has(act.id);
                const linkCount  = links[act.id]?.length ?? 0;
                const isEditing  = isPrimary && editDraft && !isNew;

                const s          = toDate(act.start_date);
                const e          = toDate(act.end_date);
                const barLeft    = daysBetween(weekStart, s) * PX_PER_DAY;
                const barWidth   = Math.max(PX_PER_DAY * 0.5, daysBetween(s, addDays(e, 1)) * PX_PER_DAY);
                const clampLeft  = Math.max(0, barLeft);
                const clampRight = Math.min(ganttWidth, barLeft + barWidth);
                const visible    = clampRight > clampLeft;

                return (
                  <div key={act.id}
                    draggable
                    onDragStart={ev => { setDraggedId(act.id); ev.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => setDraggedId(null)}
                    onDragOver={ev => ev.preventDefault()}
                    onDrop={ev => handleRowDrop(ev, act.id)}>

                    {/* ── Main data + Gantt row (same height, same flex) ── */}
                    <div
                      className={`flex border-b border-slate-100 cursor-pointer transition-colors
                        ${isSelected ? 'bg-blue-100' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}
                        ${draggedId === act.id ? 'opacity-40' : ''}
                        hover:bg-blue-50/50`}
                      style={{ height: ROW_H }}
                      onClick={() => {
                        if (isPrimary && isEditing) return;
                        // Click en fila = toggle checkbox, siempre
                        const isChecked = selectedIds.has(act.id);
                        if (isChecked) {
                          // Deseleccionar
                          setSelectedIds(prev => { const n = new Set(prev); n.delete(act.id); return n; });
                          if (selectedId === act.id) {
                            setSelectedId(null);
                            setEditDraft(null);
                            setIsNew(false);
                          }
                        } else {
                          // Seleccionar
                          if (!multiSelect) {
                            // Sin multi: reemplaza selección
                            setSelectedIds(new Set([act.id]));
                          } else {
                            setSelectedIds(prev => { const n = new Set(prev); n.add(act.id); return n; });
                          }
                          setSelectedId(act.id);
                          setChipSel(null);
                          setIsNew(false);
                          setEditDraft(null);
                          const actLinks = links[act.id];
                          if (actLinks?.length) viewerApiRef.current?.zoomToElements(actLinks);
                        }
                      }}>

                      {/* ── Left data column ── */}
                      <div
                        className="group shrink-0 flex items-center px-1 border-r border-slate-200 relative"
                        style={{ width: 440, borderLeft: `3px solid ${color}` }}>

                        {/* Checkbox — siempre visible, sincronizado con click de fila */}
                        <input
                          type="checkbox"
                          checked={selectedIds.has(act.id)}
                          onChange={ev => ev.stopPropagation()}
                          onClick={ev => ev.stopPropagation()}
                          className="shrink-0 mr-1 accent-blue-500 cursor-pointer w-3 h-3"
                          title="Seleccionar actividad"
                        />

                        {/* Drag handle + link badge */}
                        <div className="flex shrink-0 items-center justify-center w-8 mr-1 text-slate-300 group-hover:text-slate-500 cursor-grab active:cursor-grabbing">
                          <GripHorizontal className="w-3 h-3 mr-1" />
                          {linkCount > 0 ? (
                            <span className="text-[8px] px-1 py-0.5 rounded font-bold text-white shadow-sm bg-emerald-500">{linkCount}</span>
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                          )}
                        </div>

                        {/* Discipline select */}
                        <div className="w-[42px] shrink-0 flex justify-center mr-1">
                          <select
                            value={act.discipline || ''}
                            onChange={ev => updateActivityField(act, 'discipline', ev.target.value)}
                            onClick={ev => ev.stopPropagation()}
                            className="w-full text-[7.5px] font-bold text-white outline-none cursor-pointer text-center appearance-none rounded px-0.5 py-0.5 focus:ring-1 focus:ring-white/50"
                            style={{ backgroundColor: discColor(act.discipline) }}
                            title="Cambiar Especialidad">
                            <option value="" className="text-black bg-white">---</option>
                            {DISCIPLINES.map(d => <option key={d} value={d} className="text-black bg-white">{d.substring(0, 3)}</option>)}
                          </select>
                        </div>

                        {/* Title */}
                        <input
                          type="text"
                          value={act.title || ''}
                          onChange={ev => setActivities(p => p.map(a => a.id === act.id ? { ...a, title: ev.target.value } : a))}
                          onBlur={ev => updateActivityField(act, 'title', ev.target.value)}
                          onClick={ev => ev.stopPropagation()}
                          className="flex-1 text-[10px] font-semibold text-slate-700 truncate pr-2 bg-transparent border border-transparent focus:bg-white focus:border-blue-300 rounded px-1 min-w-[50px]"
                        />

                        {/* Start date */}
                        <input
                          type="date"
                          value={act.start_date || ''}
                          onChange={ev => setActivities(p => p.map(a => a.id === act.id ? { ...a, start_date: ev.target.value } : a))}
                          onBlur={ev => updateActivityField(act, 'start_date', ev.target.value)}
                          onClick={ev => ev.stopPropagation()}
                          className="w-[72px] text-[9.5px] text-slate-600 bg-transparent border border-transparent hover:border-slate-300 focus:bg-white focus:border-blue-300 rounded px-0.5 py-0.5 transition-colors cursor-text [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer mr-0.5"
                        />

                        {/* End date */}
                        <input
                          type="date"
                          value={act.end_date || ''}
                          onChange={ev => setActivities(p => p.map(a => a.id === act.id ? { ...a, end_date: ev.target.value } : a))}
                          onBlur={ev => updateActivityField(act, 'end_date', ev.target.value)}
                          onClick={ev => ev.stopPropagation()}
                          className="w-[72px] text-[9.5px] text-slate-600 bg-transparent border border-transparent hover:border-slate-300 focus:bg-white focus:border-blue-300 rounded px-0.5 py-0.5 transition-colors cursor-text [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer mr-1"
                        />

                        {/* Hover actions */}
                        {isSelected && viewerSel.length > 0 ? (
                          <div className="absolute right-1 flex items-center gap-1 bg-white/95 px-1 py-0.5 rounded shadow-sm border border-emerald-300 z-10">
                            <button onClick={ev => { ev.stopPropagation(); linkElements(); }} disabled={saving}
                              className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 hover:bg-emerald-400 text-white disabled:opacity-50">
                              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3" /> Guardar ({viewerSel.length})</>}
                            </button>
                          </div>
                        ) : (
                          <div className="absolute right-1 hidden group-hover:flex items-center gap-1 bg-white/95 px-1 py-0.5 rounded shadow-sm border border-slate-200 z-10">
                            {/* Zoom + Ghost */}
                            {linkCount > 0 && (
                              <button
                                onClick={ev => { ev.stopPropagation(); viewerApiRef.current?.zoomToElements(links[act.id] ?? []); }}
                                title="Zoom + Ghost a esta actividad"
                                className="text-slate-400 hover:text-blue-600 transition-colors p-0.5 rounded">
                                <Maximize2 className="w-3 h-3" />
                              </button>
                            )}
<button onClick={ev => { ev.stopPropagation(); deleteActivity(act.id); }}
                              className="text-slate-400 hover:text-red-600 transition-colors p-0.5 rounded">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* ── Gantt column ── */}
                      <div className="relative flex-1 overflow-hidden" style={{ minWidth: ganttWidth }}>

                        {/* 4D scrubber */}
                        {Math.abs(daysBetween(weekStart, currentDate)) <= DAYS && (
                          <div className="absolute top-0 bottom-0 border-l-2 border-red-500 z-10 opacity-60 pointer-events-none"
                            style={{ left: daysBetween(weekStart, currentDate) * PX_PER_DAY }} />
                        )}

                        {/* Weekend shading */}
                        {Array.from({ length: DAYS }, (_, i) => {
                          const day = addDays(weekStart, i);
                          const wd  = day.getDay();
                          if (wd !== 0 && wd !== 6) return null;
                          return <div key={i} className="absolute top-0 bottom-0 bg-slate-100/60 pointer-events-none" style={{ left: i * PX_PER_DAY, width: PX_PER_DAY }} />;
                        })}

                        {/* Selected row highlight */}
                        {isSelected && <div className="absolute inset-0 bg-blue-50/50 pointer-events-none" />}

                        {/* Dirty save/revert */}
                        {isDirty && (
                          <div className="absolute left-1 top-0 bottom-0 flex items-center z-30">
                            <div className="flex items-center gap-0.5">
                              <button
                                onClick={ev => { ev.stopPropagation(); saveActivity(act); setDirtyIds(p => { const n = new Set(p); n.delete(act.id); return n; }); }}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white p-1 rounded-sm shadow-lg flex items-center gap-1 text-[8.5px] font-bold h-5 uppercase active:scale-95">
                                <Check className="w-3 h-3" /> Guardar
                              </button>
                              <button
                                onClick={ev => { ev.stopPropagation(); setDirtyIds(p => { const n = new Set(p); n.delete(act.id); return n; }); load(); }}
                                className="bg-slate-500 hover:bg-slate-400 text-white p-1 rounded-sm shadow-lg h-5 active:scale-95">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Gantt bar — color = discipline color for coherence with left column */}
                        {visible && (
                          <div
                            className="absolute rounded select-none cursor-grab active:cursor-grabbing"
                            style={{
                              left:      clampLeft,
                              width:     clampRight - clampLeft,
                              top:       4,
                              height:    20,
                              background: color,
                              opacity:   isSelected ? 1 : 0.82,
                              boxShadow: isSelected ? `0 0 0 2px white, 0 0 0 3px ${color}` : undefined,
                            }}
                            onMouseDown={ev => onBarMouseDown(ev, act, 'move')}>
                            {/* Left resize */}
                            {barLeft >= 0 && (
                              <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize"
                                style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '3px 0 0 3px' }}
                                onMouseDown={ev => onBarMouseDown(ev, act, 'start')} />
                            )}
                            {/* Progress */}
                            {act.progress > 0 && (
                              <div className="absolute inset-y-0 left-2 rounded bg-black/20"
                                style={{ width: `calc(${act.progress}% - 8px)` }} />
                            )}
                            {/* Label */}
                            <span className="absolute inset-0 flex items-center px-2 text-[9.5px] font-bold text-white truncate pointer-events-none drop-shadow-sm">
                              {(clampRight - clampLeft) > 60 ? act.title : ''}
                            </span>
                            {/* Right resize */}
                            {barLeft + barWidth <= ganttWidth && (
                              <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize"
                                style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '0 3px 3px 0' }}
                                onMouseDown={ev => onBarMouseDown(ev, act, 'end')} />
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── Linked elements chips (visible for primary selection only) ── */}
                    {isPrimary && linkCount > 0 && (
                      <>
                        {/* Toggle bar */}
                        <div
                          className="flex items-center gap-1.5 px-2 bg-emerald-50 border-b border-emerald-200 cursor-pointer hover:bg-emerald-100 transition-colors select-none"
                          style={{ height: 20 }}
                          onClick={ev => { ev.stopPropagation(); setShowChips(p => !p); }}>
                          {showChips
                            ? <ChevronDown  className="w-3 h-3 text-emerald-600 shrink-0" />
                            : <ChevronRight className="w-3 h-3 text-emerald-600 shrink-0" />}
                          <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wide">
                            {linkCount} elemento{linkCount !== 1 ? 's' : ''} vinculado{linkCount !== 1 ? 's' : ''}
                          </span>
                          {pendingRemove.size > 0 && (
                            <span className="text-[9px] text-red-500 font-semibold">· {pendingRemove.size} por eliminar</span>
                          )}
                        </div>

                        {/* Chip panel */}
                        {showChips && (
                          <div className="flex items-center flex-wrap gap-1 px-2 py-1.5 bg-emerald-50 border-b border-emerald-200">
                            {(links[act.id] ?? []).map(extId => {
                              const isChipActive  = chipSel === extId;
                              const isPending     = pendingRemove.has(extId);
                              return (
                                <span key={extId}
                                  onClick={ev => { ev.stopPropagation(); setChipSel(isChipActive ? null : extId); }}
                                  title={extId}
                                  className={`flex items-center gap-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-mono cursor-pointer transition-colors
                                    ${isPending
                                      ? 'bg-red-100 border border-red-400 text-red-700 line-through opacity-70'
                                      : isChipActive
                                        ? 'bg-amber-400 border border-amber-500 text-white font-bold shadow-sm'
                                        : 'bg-emerald-100 border border-emerald-300 text-emerald-800 hover:bg-emerald-200'}`}>
                                  <span>{extId.length > 12 ? `…${extId.slice(-10)}` : extId}</span>
                                  <button
                                    onClick={ev => { ev.stopPropagation(); togglePending(extId); }}
                                    title={isPending ? 'Desmarcar' : 'Marcar para eliminar'}
                                    className={`ml-0.5 transition-colors leading-none ${isPending ? 'text-red-500 hover:text-red-700' : 'text-emerald-400 hover:text-red-500'}`}>
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </span>
                              );
                            })}

                            {/* Save removal button */}
                            {pendingRemove.size > 0 && (
                              <button
                                onClick={ev => { ev.stopPropagation(); savePendingRemovals(); }}
                                disabled={saving}
                                className="flex items-center gap-1 shrink-0 px-2 py-0.5 rounded bg-red-500 hover:bg-red-400 text-white text-[9px] font-bold transition-colors disabled:opacity-50">
                                {saving ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Trash2 className="w-2.5 h-2.5" />}
                                Eliminar {pendingRemove.size}
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* ── Inline edit form — spans full width ── */}
                    {isEditing && (
                      <div className="flex bg-blue-50 border-b border-blue-200">
                        <div className="shrink-0 p-2 border-r border-blue-200" style={{ width: 440 }}>
                          <ActivityForm draft={editDraft} onChange={setEditDraft}
                            onSave={() => saveActivity(editDraft)}
                            onCancel={() => setEditDraft(null)}
                            saving={saving} isNew={false} />
                        </div>
                        <div className="flex-1" />
                      </div>
                    )}
                  </div>
                );
              })}</>
                    )}
                  </div>
                );
              })}
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
