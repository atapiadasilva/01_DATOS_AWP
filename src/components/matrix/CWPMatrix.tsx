'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Loader2, Search, X, RefreshCw, Download, ArrowUpDown, ArrowDown, ArrowUp, Grid3X3
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { detectCwpColumn } from '@/lib/cwp-utils';
import * as XLSX from 'xlsx';

interface CWPMatrixProps {
  cwpGroups: Record<string, Record<string, any>>;
  customViews: any[];
  entities: any[];
  onSelectCWP?: (cwp: any) => void;
}

// ─── Detecta la columna identificadora de un documento (distinta del filter_key)
function getDocIdColumn(view: any): string | null {
  const cols: string[] = view.columns || [];
  const filterKey = (view.filter_key || '').toUpperCase();
  const idPatterns = [
    'PLANO', 'DRAWING', 'NUMERO', 'NUMBER', 'NUM', 'CODIGO',
    'CODE', 'DOC', 'DOCUMENT', 'ITEM', 'ID', 'TAG', 'REV',
  ];
  const byPattern = cols.find(c =>
    idPatterns.some(p => c.toUpperCase().includes(p)) &&
    c.toUpperCase() !== filterKey
  );
  if (byPattern) return byPattern;
  // Fallback: primera columna que no sea el filter_key
  return cols.find(c => c.toUpperCase() !== filterKey) ?? cols[0] ?? null;
}

// ─── Escala de color por intensidad relativa
function getCellStyle(count: number, colMax: number): { bg: string; text: string; ring: string } {
  if (!count || colMax === 0) return { bg: 'bg-slate-100', text: 'text-slate-300', ring: '' };
  const pct = count / colMax;
  if (pct <= 0.12) return { bg: 'bg-blue-50',        text: 'text-blue-400',  ring: 'ring-1 ring-blue-100' };
  if (pct <= 0.30) return { bg: 'bg-blue-100',        text: 'text-blue-600',  ring: 'ring-1 ring-blue-200' };
  if (pct <= 0.55) return { bg: 'bg-[rgba(0,191,255,0.22)]',       text: 'text-[#0284C7]', ring: 'ring-1 ring-blue-300' };
  if (pct <= 0.80) return { bg: 'bg-[#0C1E4F]/25',    text: 'text-[#0C1E4F]', ring: 'ring-1 ring-brand-electric/30' };
  return               { bg: 'bg-[#0C1E4F]',          text: 'text-white',     ring: '' };
}

function getTotalStyle(count: number): string {
  if (!count) return 'bg-slate-50 text-slate-300';
  if (count < 10)  return 'bg-slate-100 text-slate-500';
  if (count < 50)  return 'bg-blue-50 text-blue-600';
  if (count < 200) return 'bg-[rgba(0,191,255,0.12)] text-[#0284C7] font-black';
  return 'bg-[#0C1E4F] text-white font-black';
}

// ─── Mini waffle chart (4 × 5 = 20 cuadros)
const WAFFLE_TOTAL = 20;
function MiniWaffle({ count, colMax, textColor }: { count: number; colMax: number; textColor: string }) {
  const filled = count > 0 && colMax > 0
    ? Math.max(1, Math.round((count / colMax) * WAFFLE_TOTAL))
    : 0;
  return (
    <div className="grid grid-cols-5 gap-[2px] mt-1.5 px-0.5">
      {Array.from({ length: WAFFLE_TOTAL }).map((_, i) => (
        <div
          key={i}
          className={`w-[5px] h-[5px] rounded-[1px] ${textColor} ${i < filled ? 'opacity-60' : 'opacity-10'} bg-current`}
        />
      ))}
    </div>
  );
}

export default function CWPMatrix({ cwpGroups, customViews, entities, onSelectCWP }: CWPMatrixProps) {
  // counts[cwpName][viewId] = conteo de valores únicos del identificador principal
  const [counts, setCounts]       = useState<Record<string, Record<string, number>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [lastLoad, setLastLoad]   = useState<Date | null>(null);
  const [search, setSearch]       = useState('');
  const [sortView, setSortView]   = useState<string | null>(null);
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc');

  // Sólo vistas con filter_key configurado o detectable
  const linkedViews = useMemo(() =>
    customViews.filter(v => (v.filter_key || detectCwpColumn(v.columns || [])) && v.entity_id),
    [customViews]
  );

  const allCwps: any[] = useMemo(() =>
    Object.values(cwpGroups).flatMap(g => Object.values(g)),
    [cwpGroups]
  );

  // ─── Máximos por columna (para escala de color y waffle)
  const columnMaxes = useMemo(() => {
    const maxes: Record<string, number> = {};
    linkedViews.forEach(view => {
      maxes[view.id] = Math.max(...allCwps.map(cwp => counts[cwp.name]?.[view.id] ?? 0), 1);
    });
    return maxes;
  }, [counts, linkedViews, allCwps]);

  // ─── CWPs filtrados y ordenados
  const displayCwps = useMemo(() => {
    let result = allCwps;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((cwp: any) =>
        cwp.name.toLowerCase().includes(q) || cwp.discipline.toLowerCase().includes(q)
      );
    }
    if (sortView) {
      result = [...result].sort((a: any, b: any) => {
        const av = counts[a.name]?.[sortView] ?? 0;
        const bv = counts[b.name]?.[sortView] ?? 0;
        return sortDir === 'desc' ? bv - av : av - bv;
      });
    }
    return result;
  }, [allCwps, search, sortView, sortDir, counts]);

  // ─── Totales
  const rowTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    allCwps.forEach((cwp: any) => {
      totals[cwp.name] = linkedViews.reduce((sum, v) => sum + (counts[cwp.name]?.[v.id] ?? 0), 0);
    });
    return totals;
  }, [allCwps, linkedViews, counts]);

  const colTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    linkedViews.forEach(view => {
      totals[view.id] = allCwps.reduce((sum, cwp: any) => sum + (counts[cwp.name]?.[view.id] ?? 0), 0);
    });
    return totals;
  }, [allCwps, linkedViews, counts]);

  const grandTotal = useMemo(() =>
    Object.values(colTotals).reduce((a, b) => a + b, 0),
    [colTotals]
  );

  // ─── Carga de conteos con deduplicación por identificador único ──────────────
  const loadCounts = async () => {
    if (linkedViews.length === 0 || allCwps.length === 0) return;
    setIsLoading(true);

    // Acumulamos Sets para deduplicar: distinctSets[cwpVal][viewId] = Set<docId>
    const distinctSets: Record<string, Record<string, Set<string>>> = {};

    // Agrupar vistas por entity_id → una sola query por entidad
    const entityMap: Record<string, typeof linkedViews> = {};
    linkedViews.forEach(v => {
      if (!entityMap[v.entity_id]) entityMap[v.entity_id] = [];
      entityMap[v.entity_id].push(v);
    });

    await Promise.all(
      Object.entries(entityMap).map(async ([entityId, views]) => {
        const { data, error } = await supabase
          .from('data_records')
          .select('id, data')
          .eq('entity_id', entityId);

        if (error || !data) return;

        views.forEach(view => {
          const filterKey = view.filter_key || detectCwpColumn(view.columns || []);
          if (!filterKey) return;
          const docIdCol  = getDocIdColumn(view);

          data.forEach(r => {
            // Valor del filtro CWP
            const rawCwp = r.data?.[filterKey] ?? '';
            const cwpVal = String(rawCwp).trim();
            if (!cwpVal) return;

            // Identificador único del documento (para deduplicar)
            const rawDoc  = docIdCol ? r.data?.[docIdCol] : null;
            const docId   = rawDoc != null && String(rawDoc).trim() !== ''
              ? String(rawDoc).trim()
              : String(r.id);   // fallback al id del registro

            if (!distinctSets[cwpVal])          distinctSets[cwpVal] = {};
            if (!distinctSets[cwpVal][view.id]) distinctSets[cwpVal][view.id] = new Set();
            distinctSets[cwpVal][view.id].add(docId);
          });
        });
      })
    );

    // Convertir Sets → conteos
    const newCounts: Record<string, Record<string, number>> = {};
    Object.entries(distinctSets).forEach(([cwpName, viewMap]) => {
      newCounts[cwpName] = {};
      Object.entries(viewMap).forEach(([viewId, set]) => {
        newCounts[cwpName][viewId] = set.size;
      });
    });

    setCounts(newCounts);
    setLastLoad(new Date());
    setIsLoading(false);
  };

  useEffect(() => {
    if (linkedViews.length > 0 && allCwps.length > 0) loadCounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedViews.length, allCwps.length]);

  // ─── Exportar a Excel
  const handleExport = () => {
    const rows = displayCwps.map((cwp: any) => {
      const row: any = { CWP: cwp.name, Disciplina: cwp.discipline };
      linkedViews.forEach(v => { row[v.name] = counts[cwp.name]?.[v.id] ?? 0; });
      row['TOTAL'] = rowTotals[cwp.name] ?? 0;
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Matriz_CWP');
    XLSX.writeFile(wb, `Matriz_CWP_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ─── Toggle orden de columna
  const toggleSort = (viewId: string) => {
    if (sortView === viewId) {
      if (sortDir === 'desc') setSortDir('asc');
      else { setSortView(null); setSortDir('desc'); }
    } else {
      setSortView(viewId);
      setSortDir('desc');
    }
  };

  // ─── Estadísticas de cobertura
  const coverageStats = useMemo(() => {
    if (!allCwps.length || !linkedViews.length) return null;
    const total  = allCwps.length * linkedViews.length;
    const filled = allCwps.reduce((acc, cwp: any) =>
      acc + linkedViews.filter(v => (counts[cwp.name]?.[v.id] ?? 0) > 0).length, 0
    );
    return { total, filled, pct: Math.round((filled / total) * 100) };
  }, [allCwps, linkedViews, counts]);

  // ─── Render
  if (linkedViews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center p-20">
        <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center text-slate-200">
          <Grid3X3 size={48} />
        </div>
        <div className="max-w-sm">
          <p className="text-xl font-black italic text-slate-700 mb-2">Sin vistas configuradas</p>
          <p className="text-sm text-slate-400 font-bold italic">
            Ve a <span className="text-[#0C1E4F] font-black">Vistas Personalizadas</span> y asigna una
            {' '}<span className="font-black">Columna de Filtrado</span> (CWP o EDT) para que aparezcan en esta matriz.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ─── Header de controles */}
      <div className="shrink-0 px-8 py-4 bg-white border-b border-slate-100 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={13} />
            <input
              type="text"
              placeholder="Buscar CWP..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-8 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-brand-electric"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                <X size={11} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-5 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <span>{displayCwps.length} CWPs</span>
            <span>{linkedViews.length} Vistas</span>
            <span className="text-[#0C1E4F]">{grandTotal.toLocaleString()} únicos totales</span>
            {coverageStats && (
              <span className={coverageStats.pct >= 70 ? 'text-[#0C1E4F]' : 'text-amber-500'}>
                {coverageStats.pct}% cobertura
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {lastLoad && (
            <span className="text-[9px] font-bold text-slate-300 italic">
              {lastLoad.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={loadCounts}
            disabled={isLoading}
            className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-slate-400 hover:bg-slate-100 transition-all disabled:opacity-40"
            title="Recargar datos"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-slate-50 border border-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all flex items-center gap-1.5"
          >
            <Download size={12} /> Excel
          </button>
        </div>
      </div>

      {/* ─── Leyenda */}
      <div className="shrink-0 px-8 py-2 bg-white border-b border-slate-100 flex items-center gap-4">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-1">Intensidad</span>
        {[
          { label: 'Sin datos', bg: 'bg-slate-100',      text: 'text-slate-300' },
          { label: 'Pocos',     bg: 'bg-blue-50',        text: 'text-blue-400' },
          { label: 'Medio',     bg: 'bg-blue-100',       text: 'text-blue-600' },
          { label: 'Bueno',     bg: 'bg-[rgba(0,191,255,0.22)]',      text: 'text-[#0284C7]' },
          { label: 'Alto',      bg: 'bg-[#0C1E4F]/25',   text: 'text-[#0C1E4F]' },
          { label: 'Máximo',    bg: 'bg-[#0C1E4F]',      text: 'text-white' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className={`w-5 h-5 rounded-md ${item.bg} flex items-center justify-center`}>
              <span className={`text-[7px] font-black ${item.text}`}>N</span>
            </div>
            <span className="text-[9px] text-slate-400 font-bold">{item.label}</span>
          </div>
        ))}
        <span className="ml-4 text-[9px] text-slate-300 font-bold italic">
          · El número muestra valores únicos (sin duplicados por documento)
        </span>
      </div>

      {/* ─── Tabla Matriz */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
            <Loader2 className="animate-spin" size={32} />
            <p className="text-sm font-bold italic">Calculando documentos únicos por CWP...</p>
          </div>
        ) : (
          <table className="border-collapse w-max min-w-full">
            <thead className="sticky top-0 z-20 bg-white shadow-sm">
              <tr>
                {/* CWP header */}
                <th className="sticky left-0 z-30 bg-white px-5 py-4 text-left border-b border-r border-slate-200 min-w-[180px]">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CWP</span>
                </th>

                {/* View columns */}
                {linkedViews.map(view => {
                  const isSorted = sortView === view.id;
                  const entity   = entities.find(e => e.id === view.entity_id);
                  const docCol   = getDocIdColumn(view);
                  return (
                    <th
                      key={view.id}
                      onClick={() => toggleSort(view.id)}
                      className="px-4 py-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors min-w-[130px] max-w-[160px]"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-[10px] font-black uppercase tracking-widest truncate max-w-[140px] block ${isSorted ? 'text-[#0C1E4F]' : 'text-slate-700'}`}>
                          {view.name}
                        </span>
                        <span className="text-[8px] font-bold text-slate-300 truncate max-w-[140px] block">
                          {entity?.name?.slice(0, 20)}
                        </span>
                        {docCol && (
                          <span className="text-[7px] font-black text-slate-200 truncate max-w-[130px] block italic">
                            ID: {docCol}
                          </span>
                        )}
                        <div className="flex items-center gap-1">
                          <span className={`text-[9px] font-black ${isSorted ? 'text-[#0C1E4F]' : 'text-slate-300'}`}>
                            {colTotals[view.id]?.toLocaleString() ?? 0}
                          </span>
                          {isSorted
                            ? sortDir === 'desc'
                              ? <ArrowDown size={9} className="text-[#0C1E4F]" />
                              : <ArrowUp size={9} className="text-[#0C1E4F]" />
                            : <ArrowUpDown size={9} className="text-slate-200" />
                          }
                        </div>
                      </div>
                    </th>
                  );
                })}

                {/* TOTAL column */}
                <th className="px-4 py-4 border-b border-l border-slate-200 min-w-[80px]">
                  <div className="text-center">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Total</span>
                    <span className="text-[10px] font-black text-[#0C1E4F]">{grandTotal.toLocaleString()}</span>
                  </div>
                </th>
              </tr>
            </thead>

            <tbody>
              {displayCwps.map((cwp: any, rowIdx: number) => {
                const rowTotal = rowTotals[cwp.name] ?? 0;
                return (
                  <tr
                    key={cwp.name}
                    className={`group transition-all ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} hover:bg-blue-50/20`}
                  >
                    {/* CWP name */}
                    <td className="sticky left-0 z-10 bg-inherit px-5 py-3 border-r border-slate-100">
                      <button onClick={() => onSelectCWP?.(cwp)} className="text-left w-full group/btn">
                        <p className="text-[11px] font-black text-slate-800 group-hover/btn:text-[#0C1E4F] transition-colors truncate max-w-[160px]">
                          {cwp.name}
                        </p>
                        <p className="text-[9px] font-bold text-slate-400 truncate">{cwp.discipline}</p>
                      </button>
                    </td>

                    {/* Cells por vista */}
                    {linkedViews.map(view => {
                      const count = counts[cwp.name]?.[view.id] ?? 0;
                      const { bg, text, ring } = getCellStyle(count, columnMaxes[view.id] ?? 1);
                      return (
                        <td key={view.id} className="px-2 py-2 text-center border-r border-slate-50">
                          <div
                            className={`relative mx-auto w-[110px] rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-105 hover:shadow-md px-2 pt-2 pb-1.5 ${bg} ${ring}`}
                            onClick={() => onSelectCWP?.(cwp)}
                            title={`${cwp.name} × ${view.name}: ${count} únicos`}
                          >
                            {/* Número único */}
                            <span className={`text-sm font-black leading-none ${text}`}>
                              {count > 0 ? count.toLocaleString() : '—'}
                            </span>

                            {/* Mini waffle chart */}
                            {count > 0 && (
                              <MiniWaffle
                                count={count}
                                colMax={columnMaxes[view.id] ?? 1}
                                textColor={text}
                              />
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {/* Total fila */}
                    <td className="px-3 py-2 border-l border-slate-100 text-center">
                      <span className={`inline-block px-3 py-1.5 rounded-xl text-xs font-black ${getTotalStyle(rowTotal)}`}>
                        {rowTotal > 0 ? rowTotal.toLocaleString() : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {/* ─── Fila de totales */}
              <tr className="bg-slate-900 text-white sticky bottom-0 z-10">
                <td className="sticky left-0 z-20 bg-slate-900 px-5 py-4 border-r border-slate-700">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">TOTALES</span>
                </td>
                {linkedViews.map(view => (
                  <td key={view.id} className="px-2 py-3 text-center border-r border-slate-800">
                    <span className="text-sm font-black text-white">
                      {colTotals[view.id]?.toLocaleString() ?? 0}
                    </span>
                  </td>
                ))}
                <td className="px-3 py-3 text-center border-l border-slate-700">
                  <span className="text-base font-black text-[#FF9800]">
                    {grandTotal.toLocaleString()}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
