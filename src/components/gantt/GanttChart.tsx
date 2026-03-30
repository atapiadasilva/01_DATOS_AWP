'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ChevronRight, ChevronDown, Loader2,
  ZoomIn, ZoomOut, BarChart3, TrendingUp, Clock, Target,
  Maximize2, Minimize2
} from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { useProject } from '@/contexts/ProjectContext';

// ─── Types ────────────────────────────────────────────────────────────────────
interface GanttTask {
  edt: string;
  cwp: string;
  name: string;
  dur: string;
  bStart: string;
  bEnd: string;
  aStart: string;
  aEnd: string;
  pct: number;
  hh: number;
  level: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ROW_H    = 36;
const COL_EDT  = 72;
const COL_HH   = 76;
const COL_PCT  = 58;
const LEFT_W   = COL_EDT + 240 + COL_HH + COL_PCT; // 446px

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseDate(s: string): Date | null {
  if (!s || s === 'NOD') return null;
  // ISO format: yyyy-mm-dd (from API)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  // dd/mm/yyyy (from legacy JSON)
  if (s.includes('/')) {
    const [d, m, y] = s.split('/').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }
  return null;
}

function fmtHH(n: number): string {
  if (!n) return '—';
  return n.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + ' h';
}

function fmtShortDate(s: string): string {
  const d = parseDate(s);
  if (!d) return '—';
  return d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

function getAncestors(edt: string): string[] {
  const parts = edt.split('.');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('.'));
}

// ─── MetricCard ───────────────────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white/5 rounded-xl border border-white/10 shrink-0">
      <Icon size={14} className={color} />
      <div>
        <div className="text-[8px] font-black uppercase tracking-widest text-white/40">{label}</div>
        <div className={`text-sm font-black leading-none mt-0.5 ${color}`}>{value}</div>
        {sub && <div className="text-[8px] text-white/30 font-bold mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GanttChart() {
  const { currentProject } = useProject();
  const [tasks, setTasks]       = useState<GanttTask[]>([]);
  const [loading, setLoading]   = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dayW, setDayW]         = useState(3);
  const [search, setSearch]     = useState('');
  const [expandDepth, setExpandDepth] = useState(2);
  const [cwpFilter, setCwpFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [dbMappings, setDbMappings] = useState<Record<string, string>>({});
  const [entityName, setEntityName] = useState('');

  // ── Load data from DB via API ──────────────────────────────────────────────
  useEffect(() => {
    if (!currentProject?.id) return;
    const loadData = async () => {
      setLoading(true);
      try {
        const [wbsRes, mappingsRes] = await Promise.all([
          fetch(`/api/aps/wbs?projectId=${currentProject.id}`).then(r => {
            if (!r.ok) throw new Error(`WBS API error: ${r.status}`);
            return r.json();
          }),
          supabase
            .from('wbs_cwp_mappings')
            .select('edt, cwp_name')
            .eq('project_id', currentProject.id),
        ]);

        const raw: any[]    = wbsRes.tasks ?? [];
        const mappings: Record<string, string> = {};
        (mappingsRes.data ?? []).forEach((m: any) => { mappings[m.edt] = m.cwp_name; });
        setDbMappings(mappings);
        setEntityName(wbsRes.entityName ?? '');

        const items: GanttTask[] = raw.map((d: any) => ({
          edt:    String(d.edt ?? ''),
          cwp:    mappings[String(d.edt)] || String(d.cwp ?? ''),
          name:   String(d.name ?? ''),
          dur:    String(d.duration ?? d.dur ?? ''),
          bStart: String(d.baseStart ?? d.bStart ?? ''),
          bEnd:   String(d.baseEnd   ?? d.bEnd   ?? ''),
          aStart: String(d.start     ?? d.aStart ?? ''),
          aEnd:   String(d.end       ?? d.aEnd   ?? ''),
          pct:    parseFloat(d.progress ?? d.pct) || 0,
          hh:     parseFloat(d.hh)  || 0,
          level:  parseInt(d.level) || 0,
        }));
        setTasks(items);

        // Collapse parents at level ≥ 2 by default
        const pSet = new Set<string>();
        items.forEach(t => { getAncestors(t.edt).forEach(a => pSet.add(a)); });
        setCollapsed(new Set(items.filter(t => pSet.has(t.edt) && t.level >= 2).map(t => t.edt)));
      } catch (e) {
        console.error('Error loading gantt data:', e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [currentProject?.id]);

  // ── Unique CWP codes ───────────────────────────────────────────────────────
  const cwpCodes = useMemo(() => {
    const codes = Array.from(new Set(tasks.map((t: GanttTask) => t.cwp).filter((c: string) => c?.trim())));
    return codes.sort();
  }, [tasks]);

  // ── Parent set ─────────────────────────────────────────────────────────────
  const parentSet = useMemo(() => {
    const s = new Set<string>();
    tasks.forEach((t: GanttTask) => getAncestors(t.edt).forEach((a: string) => s.add(a)));
    return s;
  }, [tasks]);

  const isParent = useCallback((edt: string) => parentSet.has(edt), [parentSet]);

  // ── Expand / Collapse helpers ───────────────────────────────────────────────
  const toggleCollapse = (edt: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(edt) ? next.delete(edt) : next.add(edt);
      return next;
    });
  };

  const expandAll  = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(tasks.filter(t => isParent(t.edt)).map(t => t.edt)));

  const expandToLevel = (maxLevel: number) => {
    setExpandDepth(maxLevel);
    setCollapsed(new Set(
      tasks.filter((t: GanttTask) => isParent(t.edt) && t.level >= maxLevel).map((t: GanttTask) => t.edt)
    ));
  };

  // ── Visible tasks ──────────────────────────────────────────────────────────
  const visibleTasks = useMemo(() => {
    const q = search.toLowerCase();

    // When filtering by CWP: show matching leaves + their ancestors (parents expand automatically)
    let allowedEdts: Set<string> | null = null;
    if (cwpFilter) {
      allowedEdts = new Set<string>();
      tasks.filter((t: GanttTask) => t.cwp?.trim() === cwpFilter).forEach((t: GanttTask) => {
        allowedEdts!.add(t.edt);
        getAncestors(t.edt).forEach((a: string) => allowedEdts!.add(a));
      });
    }

    return tasks.filter((t: GanttTask) => {
      if (allowedEdts && !allowedEdts.has(t.edt)) return false;
      if (q && !t.name.toLowerCase().includes(q) && !t.edt.includes(q)) return false;
      if (cwpFilter) return true; // ancestors always visible when CWP filter active
      return getAncestors(t.edt).every((a: string) => !collapsed.has(a));
    });
  }, [tasks, collapsed, search, cwpFilter]);

  // ── Total HH (dynamic from root task or sum of leaves) ───────────────────
  const totalHH = useMemo(() => {
    const root = tasks.find(t => t.edt === '0');
    if (root && root.hh > 0) return root.hh;
    return tasks.filter(t => !isParent(t.edt)).reduce((s, t) => s + t.hh, 0);
  }, [tasks, isParent]);

  // ── Timeline computed from actual task dates ───────────────────────────────
  const { dispStart, dispEnd, months, totalDispDays } = useMemo(() => {
    const dates = tasks
      .flatMap(t => [t.bStart, t.bEnd, t.aStart, t.aEnd])
      .map(s => parseDate(s))
      .filter((d): d is Date => d !== null);

    let start = new Date(2025, 8, 1);
    let end   = new Date(2026, 9, 1);

    if (dates.length) {
      const mn = new Date(Math.min(...dates.map(d => d.getTime())));
      const mx = new Date(Math.max(...dates.map(d => d.getTime())));
      start = new Date(mn.getFullYear(), mn.getMonth(), 1);
      end   = new Date(mx.getFullYear(), mx.getMonth() + 2, 1);
    }

    const months: { y: number; m: number; label: string; days: number }[] = [];
    const d = new Date(start);
    while (d < end) {
      months.push({
        y: d.getFullYear(), m: d.getMonth(),
        label: d.toLocaleDateString('es', { month: 'short', year: '2-digit' }),
        days: daysInMonth(d.getFullYear(), d.getMonth()),
      });
      d.setMonth(d.getMonth() + 1);
    }
    const totalDispDays = Math.floor((end.getTime() - start.getTime()) / 86400000);
    return { dispStart: start, dispEnd: end, months, totalDispDays };
  }, [tasks]);

  const totalW = totalDispDays * dayW;

  // ── Bar position calc ──────────────────────────────────────────────────────
  const barPos = useCallback((s: string, e: string) => {
    const sd = parseDate(s), ed = parseDate(e);
    if (!sd || !ed) return null;
    const left  = Math.max(0, (sd.getTime() - dispStart.getTime()) / 86400000) * dayW;
    const width = Math.max(dayW, (ed.getTime() - sd.getTime()) / 86400000 * dayW);
    return { left, width };
  }, [dispStart, dayW]);

  // ── Today marker ──────────────────────────────────────────────────────────
  const todayLeft = useMemo(() => {
    const today = new Date();
    const diff = (today.getTime() - dispStart.getTime()) / 86400000;
    if (diff < 0 || diff > totalDispDays) return -1;
    return diff * dayW;
  }, [dispStart, totalDispDays, dayW]);

  // ── Metrics ────────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const root = tasks.find((t: GanttTask) => t.edt === '0');
    const globalPct = root?.pct ?? 0;
    const doneHH = totalHH * globalPct / 100;
    const leaves = tasks.filter((t: GanttTask) => !isParent(t.edt) && t.hh > 0);
    return { globalPct, doneHH, leafCount: leaves.length };
  }, [tasks, isParent, totalHH]);

  const isMilestone = (t: GanttTask) =>
    t.dur === '0 días' || t.dur === '0 dias' || t.dur === '0 d' || t.dur.startsWith('0 d');

  // ── Month offsets ──────────────────────────────────────────────────────────
  const monthOffsets = useMemo(() => {
    let x = 0;
    return months.map(m => { const off = x; x += m.days * dayW; return off; });
  }, [months, dayW]);

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-4 text-brand-slate/50">
        <Loader2 className="animate-spin text-brand-electric" size={28} />
        <span className="text-sm font-bold italic">Cargando programa de obra...</span>
      </div>
    );
  }

  if (!tasks.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-brand-slate/40 text-sm font-bold">
        <span>Sin programa de obra cargado para este proyecto.</span>
        <span className="text-xs font-normal">Carga un archivo WBS en &quot;Carga de Datos&quot; y configura las columnas en Ajustes del proyecto.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-brand-cloud/20">

      {/* ── Métricas del programa ── */}
      <div className="shrink-0 bg-brand-deep px-6 py-3 flex items-center gap-4 shadow-lg shadow-brand-deep/20">
        <div className="mr-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-brand-electric/60">{entityName || 'Programa de Obra'}</p>
          <h2 className="text-[15px] font-black italic text-white tracking-tight leading-tight">
            {tasks.find(t => t.edt === '0')?.name || currentProject?.name || '—'}
          </h2>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <MetricCard icon={BarChart3}   label="HH Totales"    value={totalHH > 0 ? fmtHH(totalHH) : '—'} color="text-brand-electric" />
          <MetricCard icon={TrendingUp}  label="HH Ejecutadas" value={fmtHH(metrics.doneHH)} color="text-brand-orange" />
          <MetricCard icon={Target}      label="% Avance"      value={`${metrics.globalPct}%`} color="text-brand-orange" />
          <MetricCard icon={Clock}       label="Actividades"   value={`${tasks.length}`} sub={`${metrics.leafCount} con HH`} color="text-white/60" />
        </div>
        {/* Barra de avance global */}
        <div className="ml-auto w-48 shrink-0">
          <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-white/40 mb-1">
            <span>Avance global</span>
            <span className="text-brand-orange">{metrics.globalPct}%</span>
          </div>
          <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-orange to-brand-electric rounded-full transition-all duration-700"
              style={{ width: `${metrics.globalPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[7px] font-bold text-white/30 mt-1">
            <span>{dispStart.toLocaleDateString('es', { month: 'short', year: 'numeric' })}</span>
            <span>{dispEnd.toLocaleDateString('es', { month: 'short', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* ── Controles ── */}
      <div className="shrink-0 bg-white border-b border-brand-cloud px-5 py-2 flex items-center gap-2 flex-wrap">
        {/* Búsqueda */}
        <input
          type="text"
          placeholder="Buscar actividad o EDT..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-48 px-3 py-1.5 bg-brand-cloud/60 border border-brand-cloud rounded-lg text-[11px] font-bold outline-none focus:border-brand-electric text-brand-slate"
        />

        {/* CWP filter */}
        <select
          value={cwpFilter}
          onChange={e => setCwpFilter(e.target.value)}
          className={`px-3 py-1.5 border rounded-lg text-[11px] font-bold outline-none transition-all ${
            cwpFilter
              ? 'bg-brand-electric/10 border-brand-electric text-brand-electric'
              : 'bg-brand-cloud/60 border-brand-cloud text-brand-slate/60 focus:border-brand-electric'
          }`}
        >
          <option value="">Todos los CWP</option>
          {cwpCodes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {cwpFilter && (
          <button
            onClick={() => setCwpFilter('')}
            className="px-2 py-1.5 bg-brand-electric/10 text-brand-electric rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-brand-electric/20 transition-all"
          >
            ✕ Limpiar
          </button>
        )}

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {/* Niveles rápidos */}
        <span className="text-[9px] font-black text-brand-slate/40 uppercase tracking-widest">Nivel:</span>
        {[1, 2, 3, 4].map(n => (
          <button
            key={n}
            onClick={() => expandToLevel(n)}
            className={`px-2.5 py-1 text-[9px] font-black rounded-lg uppercase tracking-widest transition-all ${
              expandDepth === n
                ? 'bg-brand-deep text-white'
                : 'bg-brand-cloud text-brand-slate/50 hover:bg-brand-cloud/80'
            }`}
          >
            N{n}
          </button>
        ))}

        <div className="w-px h-5 bg-slate-200 mx-1" />
        <button onClick={expandAll} className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-brand-slate/50 hover:text-brand-deep hover:bg-brand-cloud rounded-lg transition-all flex items-center gap-1">
          <Maximize2 size={10} /> Todo
        </button>
        <button onClick={collapseAll} className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-brand-slate/50 hover:text-brand-deep hover:bg-brand-cloud rounded-lg transition-all flex items-center gap-1">
          <Minimize2 size={10} /> Colapsar
        </button>

        <div className="w-px h-5 bg-slate-200 mx-1" />
        {/* Zoom */}
        <button onClick={() => setDayW(w => Math.max(1, w - 1))} className="p-1.5 hover:bg-brand-cloud rounded-lg transition-all text-brand-slate/50">
          <ZoomOut size={13} />
        </button>
        <span className="text-[9px] font-bold text-brand-slate/40 w-14 text-center">{dayW} px/día</span>
        <button onClick={() => setDayW(w => Math.min(10, w + 1))} className="p-1.5 hover:bg-brand-cloud rounded-lg transition-all text-brand-slate/50">
          <ZoomIn size={13} />
        </button>

        <div className="ml-auto flex items-center gap-5">
          <span className="text-[9px] font-bold text-brand-slate/40">
            {visibleTasks.length} / {tasks.length} actividades
          </span>
          {/* Leyenda */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-1 bg-slate-300 rounded-full" />
              <span className="text-[8px] font-bold text-brand-slate/50">Línea base</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-3 rounded-sm bg-brand-electric/30 border border-brand-electric/50" />
              <span className="text-[8px] font-bold text-brand-slate/50">En curso</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-3 rounded-sm bg-brand-deep/30 border border-brand-deep/50" />
              <span className="text-[8px] font-bold text-brand-slate/50">Completo</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-brand-orange font-black text-[10px]">◆</span>
              <span className="text-[8px] font-bold text-brand-slate/50">Hito</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabla + Gantt (scroll unificado) ── */}
      <div ref={containerRef} className="flex-1 overflow-auto custom-scrollbar">
        <div style={{ minWidth: LEFT_W + totalW }}>

          {/* ── Header sticky ── */}
          <div className="sticky top-0 z-30 flex bg-white border-b-2 border-brand-cloud shadow-md">

            {/* Left header (sticky left dentro del sticky top) */}
            <div className="sticky left-0 z-40 bg-white flex border-r-2 border-brand-cloud shadow-sm shrink-0" style={{ width: LEFT_W }}>
              <div style={{ width: COL_EDT }} className="px-2 py-3 border-r border-brand-cloud/60 flex items-center">
                <span className="text-[9px] font-black uppercase tracking-widest text-brand-slate/40">EDT</span>
              </div>
              <div className="flex-1 px-3 py-3 border-r border-brand-cloud/60 flex items-center">
                <span className="text-[9px] font-black uppercase tracking-widest text-brand-slate/40">Actividad</span>
              </div>
              <div style={{ width: COL_HH }} className="px-2 py-3 border-r border-brand-cloud/60 flex items-center justify-end">
                <span className="text-[9px] font-black uppercase tracking-widest text-brand-slate/40">HH</span>
              </div>
              <div style={{ width: COL_PCT }} className="px-2 py-3 flex items-center justify-center">
                <span className="text-[9px] font-black uppercase tracking-widest text-brand-slate/40">Avance</span>
              </div>
            </div>

            {/* Month headers */}
            <div className="flex shrink-0">
              {months.map((m, i) => (
                <div
                  key={`${m.y}-${m.m}`}
                  style={{ width: m.days * dayW }}
                  className="border-r border-brand-cloud/60 flex flex-col items-center justify-center py-2 shrink-0"
                >
                  <span className="text-[9px] font-black uppercase tracking-widest text-brand-slate/60 leading-none">
                    {m.label.split(' ')[0].toUpperCase()}
                  </span>
                  <span className="text-[7px] font-bold text-brand-slate/30 mt-0.5">
                    {m.y}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Task rows ── */}
          {visibleTasks.map((task, idx) => {
            const par     = isParent(task.edt);
            const open    = !collapsed.has(task.edt);
            const mile    = isMilestone(task);
            const bP      = !mile ? barPos(task.bStart, task.bEnd) : null;
            const aP      = barPos(task.aStart, task.aEnd);
            const indent  = Math.min(task.level, 8) * 12;

            // Row background
            const rowBg =
              task.level === 0 ? 'bg-brand-deep/8' :
              task.level === 1 ? 'bg-brand-deep/5' :
              par ? (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50') :
              (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30');

            // Bar color
            const barBg =
              par        ? 'bg-brand-deep/25 border border-brand-deep/30' :
              task.pct === 100 ? 'bg-brand-deep/20 border border-brand-deep/40' :
              task.pct > 0     ? 'bg-brand-electric/20 border border-brand-electric/50' :
                                 'bg-slate-200/80 border border-slate-300/50';
            const fillBg =
              task.pct === 100 ? 'bg-brand-deep/70' :
              task.pct > 0     ? 'bg-brand-electric/70' : '';

            return (
              <div
                key={task.edt}
                className={`flex border-b border-brand-cloud/40 hover:bg-brand-electric/5 transition-colors ${rowBg}`}
                style={{ height: ROW_H }}
              >
                {/* ── Left panel (sticky) ── */}
                <div
                  className="sticky left-0 z-20 flex shrink-0 border-r-2 border-brand-cloud bg-inherit"
                  style={{ width: LEFT_W }}
                >
                  {/* EDT */}
                  <div style={{ width: COL_EDT }} className="px-2 flex items-center border-r border-brand-cloud/40 shrink-0 overflow-hidden">
                    <span className={`text-[9px] font-black truncate ${task.level <= 1 ? 'text-brand-deep' : 'text-brand-slate/40'}`}>
                      {task.edt}
                    </span>
                  </div>

                  {/* Name */}
                  <div
                    className="flex-1 flex items-center gap-1 border-r border-brand-cloud/40 overflow-hidden cursor-pointer pr-1"
                    style={{ paddingLeft: indent + 4 }}
                    onClick={() => par && toggleCollapse(task.edt)}
                  >
                    {par ? (
                      open
                        ? <ChevronDown size={9} className="shrink-0 text-brand-electric" />
                        : <ChevronRight size={9} className="shrink-0 text-brand-slate/40" />
                    ) : (
                      <span style={{ width: 10 }} className="shrink-0" />
                    )}
                    <span
                      className={`truncate leading-tight ${
                        task.level === 0 ? 'text-[10px] font-black text-brand-deep uppercase' :
                        task.level === 1 ? 'text-[9px] font-black text-brand-deep uppercase' :
                        par              ? 'text-[10px] font-bold text-brand-slate/80' :
                                           'text-[10px] font-medium text-brand-slate/65'
                      }`}
                      title={task.name}
                    >
                      {task.name}
                    </span>
                  </div>

                  {/* HH */}
                  <div style={{ width: COL_HH }} className="px-2 flex items-center justify-end border-r border-brand-cloud/40 shrink-0">
                    <span className={`text-[9px] font-black ${
                      task.hh >= 1000 ? 'text-brand-deep' :
                      task.hh > 0    ? 'text-brand-slate/60' :
                                       'text-brand-slate/25'
                    }`}>
                      {fmtHH(task.hh)}
                    </span>
                  </div>

                  {/* % Avance */}
                  <div style={{ width: COL_PCT }} className="px-2 flex flex-col items-center justify-center shrink-0 gap-0.5">
                    <span className={`text-[9px] font-black leading-none ${
                      task.pct === 100 ? 'text-brand-deep' :
                      task.pct > 0    ? 'text-brand-electric' :
                                        'text-brand-slate/25'
                    }`}>
                      {task.pct > 0 ? `${task.pct}%` : '—'}
                    </span>
                    <div className="w-full h-[3px] bg-slate-100 rounded-full overflow-hidden px-2">
                      <div
                        className={`h-full rounded-full ${
                          task.pct === 100 ? 'bg-brand-deep' :
                          task.pct > 0    ? 'bg-brand-electric' : ''
                        }`}
                        style={{ width: `${task.pct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Gantt area ── */}
                <div className="relative overflow-hidden shrink-0" style={{ width: totalW, height: ROW_H }}>

                  {/* Grid lines de meses */}
                  {months.map((m, i) => (
                    <div
                      key={`${m.y}-${m.m}`}
                      className="absolute top-0 bottom-0 border-r border-brand-cloud/50"
                      style={{ left: monthOffsets[i], width: m.days * dayW }}
                    />
                  ))}

                  {/* Today line */}
                  {todayLeft >= 0 && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-brand-orange/60 z-10 pointer-events-none"
                      style={{ left: todayLeft }}
                    />
                  )}

                  {mile ? (
                    // ── Milestone diamond ──────────────────────────────
                    aP && (
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 font-black text-[13px] cursor-default ${
                          task.pct === 100 ? 'text-brand-deep' :
                          task.pct > 0    ? 'text-brand-electric' :
                                            'text-brand-orange'
                        }`}
                        style={{ left: aP.left }}
                        title={`${task.name} | ${fmtShortDate(task.aStart)} | ${task.pct}%`}
                      >
                        ◆
                      </div>
                    )
                  ) : (
                    <>
                      {/* ── Baseline bar ────────────────────────────── */}
                      {bP && (
                        <div
                          className="absolute rounded-sm bg-slate-300/60 border border-slate-300/80 pointer-events-none"
                          style={{
                            left: bP.left,
                            width: Math.max(3, bP.width),
                            top: '62%',
                            height: 3,
                          }}
                          title={`Base: ${fmtShortDate(task.bStart)} → ${fmtShortDate(task.bEnd)}`}
                        />
                      )}

                      {/* ── Actual bar ──────────────────────────────── */}
                      {aP && (
                        <div
                          className={`absolute rounded overflow-hidden cursor-default ${barBg}`}
                          style={{
                            left: aP.left,
                            width: Math.max(4, aP.width),
                            top: '18%',
                            height: '44%',
                          }}
                          title={`${task.name}\n${fmtShortDate(task.aStart)} → ${fmtShortDate(task.aEnd)}\n${task.pct}% · ${fmtHH(task.hh)}`}
                        >
                          <div
                            className={`h-full ${fillBg} transition-all duration-500`}
                            style={{ width: `${task.pct}%` }}
                          />
                        </div>
                      )}

                      {/* HH label on bar (only if wide enough) */}
                      {aP && aP.width > 50 && task.hh > 0 && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 text-[7px] font-black text-brand-slate/50 pointer-events-none truncate px-1"
                          style={{ left: aP.left + 3, maxWidth: aP.width - 6 }}
                        >
                          {fmtHH(task.hh)}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {visibleTasks.length === 0 && (
            <div className="flex items-center justify-center py-20 text-brand-slate/30 text-sm font-bold italic">
              Sin resultados para &quot;{search}&quot;
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 bg-white border-t border-brand-cloud px-5 py-2 flex items-center gap-6 text-[8px] font-black uppercase tracking-widest text-brand-slate/30">
        <span>
          {dispStart.toLocaleDateString('es', { month: 'short', year: 'numeric' })} →{' '}
          {dispEnd.toLocaleDateString('es', { month: 'short', year: 'numeric' })} ·{' '}
          {tasks.length} actividades{totalHH > 0 ? ` · ${fmtHH(totalHH)}` : ''}
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="w-2 h-2 rounded-full bg-brand-orange" />
          <span className="text-brand-orange">
            Hoy — {new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>
    </div>
  );
}
