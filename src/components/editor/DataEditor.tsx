'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Database, Search, Check, Loader2, Save, Trash2,
  ChevronRight, Filter, Layers,
  CheckSquare, Square, X, Info, Eye, EyeOff, Tag, SlidersHorizontal
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCwpFilter } from '@/hooks/useCwpFilter';
import type { EntityWithAttributes } from '@/types';

interface DataEditorProps {
  entities: EntityWithAttributes[];
}

export default function DataEditor({ entities }: DataEditorProps) {
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [data, setData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 2000;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [editedRecords, setEditedRecords] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [groupBy, setGroupBy] = useState<string | null>(null);

  // ─── Filtrado avanzado ──────────────────────────────────────────────────
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [showColumnPanel, setShowColumnPanel] = useState(false);
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  const [cwpQuickFilter, setCwpQuickFilter] = useState('');

  // ─── Carga de Datos (paginada) ───────────────────────────────────────────
  const loadData = async (entityId: string, pageIndex = 0) => {
    if (!entityId) return;
    setIsLoading(true);
    if (pageIndex === 0) {
      setColumnFilters({});
      setCwpQuickFilter('');
    }
    try {
      const from = pageIndex * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;

      const { data: records, error, count } = await supabase
        .from('data_records')
        .select('id, data', { count: 'exact' })
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      if (records) {
        const formatted = records.map(r => ({ id: r.id, ...r.data }));
        setData(prev => pageIndex === 0 ? formatted : [...prev, ...formatted]);
        if (count !== null) setTotalCount(count);
        const cols = Array.from(new Set(formatted.flatMap(r => Object.keys(r).filter(k => k !== 'id' && !k.startsWith('_batch')))));
        if (pageIndex === 0) setColumns(cols.sort());
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEntityId) {
      setPage(0);
      setData([]);
      setTotalCount(0);
      loadData(selectedEntityId, 0);
      setSelectedRows(new Set());
      setEditedRecords({});
      setHiddenColumns(new Set());
    }
  }, [selectedEntityId]);

  // ─── Detección columna CWP ───────────────────────────────────────────────
  const { cwpColumn, cwpValues } = useCwpFilter(columns, data);

  // ─── Filtrado multi-columna ───────────────────────────────────────────────
  const filteredData = useMemo(() => {
    let result = data;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(row =>
        Object.values(row).some(val => String(val).toLowerCase().includes(q))
      );
    }

    if (cwpQuickFilter && cwpColumn) {
      result = result.filter(row => String(row[cwpColumn] || '') === cwpQuickFilter);
    }

    Object.entries(columnFilters).forEach(([col, val]) => {
      if (val) {
        const q = val.toLowerCase();
        result = result.filter(row => String(row[col] || '').toLowerCase().includes(q));
      }
    });

    return result;
  }, [data, searchQuery, cwpQuickFilter, cwpColumn, columnFilters]);

  const visibleColumns = useMemo(() =>
    columns.filter(c => !hiddenColumns.has(c)),
    [columns, hiddenColumns]
  );

  const activeFilterCount = useMemo(() =>
    Object.values(columnFilters).filter(Boolean).length + (cwpQuickFilter ? 1 : 0) + (searchQuery ? 1 : 0),
    [columnFilters, cwpQuickFilter, searchQuery]
  );

  const clearAllFilters = () => {
    setSearchQuery('');
    setColumnFilters({});
    setCwpQuickFilter('');
  };

  // ─── Agrupación ────────────────────────────────────────────────────────
  const groupedData = useMemo(() => {
    if (!groupBy || !filteredData.length) return { 'Sin Grupo': filteredData };
    const groups: Record<string, any[]> = {};
    filteredData.forEach(row => {
      const val = String(row[groupBy] || 'Sin Valor');
      if (!groups[val]) groups[val] = [];
      groups[val].push(row);
    });
    return groups;
  }, [filteredData, groupBy]);

  // ─── Selección (Shift + Click) ───────────────────────────────────────────
  const handleSelectRow = (id: string, shiftKey: boolean) => {
    const next = new Set(selectedRows);
    const currentIndex = filteredData.findIndex(r => r.id === id);
    if (shiftKey && lastSelectedId) {
      const lastIndex = filteredData.findIndex(r => r.id === lastSelectedId);
      if (currentIndex !== -1 && lastIndex !== -1) {
        const [start, end] = [Math.min(currentIndex, lastIndex), Math.max(currentIndex, lastIndex)];
        const isSelecting = !selectedRows.has(id);
        for (let i = start; i <= end; i++) {
          const rowId = filteredData[i].id;
          if (isSelecting) next.add(rowId);
          else next.delete(rowId);
        }
      }
    } else {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
    setSelectedRows(next);
    setLastSelectedId(id);
  };

  const handleSelectGroup = (groupRows: any[]) => {
    const next = new Set(selectedRows);
    const allInGroupSelected = groupRows.every(r => next.has(r.id));
    groupRows.forEach(r => {
      if (allInGroupSelected) next.delete(r.id);
      else next.add(r.id);
    });
    setSelectedRows(next);
  };

  const selectAll = () => {
    if (selectedRows.size === filteredData.length && filteredData.length > 0) setSelectedRows(new Set());
    else setSelectedRows(new Set(filteredData.map(r => r.id)));
  };

  // ─── Edición y Guardado ──────────────────────────────────────────────────
  const handleEdit = (id: string, field: string, value: any) => {
    setEditedRecords(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] || data.find(r => r.id === id) || {}),
        [field]: value
      }
    }));
  };

  const handleSaveAll = async () => {
    if (Object.keys(editedRecords).length === 0) return;
    setIsSaving(true);
    try {
      const updates = Object.entries(editedRecords).map(([id, newData]) => {
        const { id: _, ...payload } = newData;
        return supabase.from('data_records').update({ data: payload }).eq('id', id);
      });
      const results = await Promise.all(updates);
      if (results.some(r => r.error)) {
        alert('Hubo errores al guardar algunos registros.');
      } else {
        setEditedRecords({});
        loadData(selectedEntityId, 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedRows.size === 0) return;
    if (!confirm(`¿Eliminar ${selectedRows.size} registros permanentemente de Supabase?`)) return;
    try {
      const { error } = await supabase
        .from('data_records')
        .delete()
        .in('id', Array.from(selectedRows));
      if (error) throw error;
      setSelectedRows(new Set());
      loadData(selectedEntityId, 0);
    } catch (err) {
      console.error(err);
      alert('Error al eliminar registros.');
    }
  };

  return (
    <div className="flex h-full gap-0 overflow-hidden bg-white">
      {/* ─── PANEL IZQUIERDO: Selector de Entidades ─── */}
      <div className="w-72 shrink-0 bg-white border-r border-slate-100 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 text-center">Bases de Datos</h4>
          <select
            value={selectedEntityId}
            onChange={e => setSelectedEntityId(e.target.value)}
            className="w-full text-xs font-bold p-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-brand-electric transition-colors"
          >
            <option value="">Seleccionar tabla...</option>
            {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-1">
          {entities.map(e => (
            <button
              key={e.id}
              onClick={() => setSelectedEntityId(e.id)}
              className={`w-full flex items-center justify-between p-4 rounded-2xl text-[11px] font-black uppercase tracking-tight transition-all ${
                selectedEntityId === e.id ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Database size={13} className={selectedEntityId === e.id ? 'text-[#0C1E4F]' : 'text-slate-300'} />
                <span className="truncate">{e.name}</span>
              </div>
              {selectedEntityId === e.id && <ChevronRight size={13} />}
            </button>
          ))}
        </div>
      </div>

      {/* ─── ÁREA PRINCIPAL ─── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 min-w-0">

        {/* Header de Acciones */}
        <header className="px-8 py-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 shadow-sm z-10 gap-4">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
              <input
                type="text"
                placeholder="Buscar en todos los campos..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-brand-electric transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Agrupación */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 p-1.5 rounded-2xl shrink-0">
              <Filter size={12} className="ml-2 text-slate-400" />
              <select
                value={groupBy || ''}
                onChange={e => setGroupBy(e.target.value || null)}
                className="bg-transparent text-[10px] font-black uppercase tracking-widest outline-none pr-4 max-w-[140px]"
              >
                <option value="">Sin Agrupación</option>
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Toggle Filtros por columna */}
            <button
              onClick={() => setShowColumnFilters(v => !v)}
              title="Filtros por columna"
              className={`p-2.5 rounded-xl transition-all relative ${showColumnFilters ? 'bg-[#0C1E4F] text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 border border-slate-100'}`}
            >
              <SlidersHorizontal size={15} />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Toggle visibilidad de columnas */}
            <button
              onClick={() => setShowColumnPanel(v => !v)}
              title="Mostrar/ocultar columnas"
              className={`p-2.5 rounded-xl transition-all ${showColumnPanel ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 border border-slate-100'}`}
            >
              <Eye size={15} />
            </button>

            {/* Limpiar filtros */}
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="px-3 py-2.5 bg-red-50 text-red-500 rounded-xl text-[10px] font-black border border-red-100 hover:bg-red-100 transition-all flex items-center gap-1.5"
              >
                <X size={12} /> Limpiar ({activeFilterCount})
              </button>
            )}

            {selectedRows.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="px-4 py-2.5 bg-red-50 text-red-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-100 transition-all flex items-center gap-2 border border-red-100"
              >
                <Trash2 size={14} /> {selectedRows.size}
              </button>
            )}

            <button
              onClick={handleSaveAll}
              disabled={isSaving || Object.keys(editedRecords).length === 0}
              className={`px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg ${
                Object.keys(editedRecords).length > 0
                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                  : 'bg-slate-50 text-slate-300 cursor-not-allowed border border-slate-100'
              }`}
            >
              {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
              {isSaving ? 'Guardando...' : `Guardar (${Object.keys(editedRecords).length})`}
            </button>
          </div>
        </header>

        {/* ─── CWP Quick Filter Bar ─── */}
        {cwpColumn && cwpValues.length > 0 && (
          <div className="px-8 py-2.5 bg-white border-b border-slate-100 flex items-center gap-2.5 overflow-x-auto shrink-0">
            <div className="flex items-center gap-2 shrink-0">
              <Tag size={11} className="text-[#0C1E4F]" />
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Filtro CWP</span>
            </div>
            <button
              onClick={() => setCwpQuickFilter('')}
              className={`px-3.5 py-1.5 rounded-full text-[9px] font-black transition-all whitespace-nowrap shrink-0 ${
                !cwpQuickFilter ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              Todos ({data.length})
            </button>
            {cwpValues.map(val => {
              const count = data.filter(r => String(r[cwpColumn] || '') === val).length;
              return (
                <button
                  key={val}
                  onClick={() => setCwpQuickFilter(cwpQuickFilter === val ? '' : val)}
                  className={`px-3.5 py-1.5 rounded-full text-[9px] font-black transition-all whitespace-nowrap shrink-0 ${
                    cwpQuickFilter === val
                      ? 'bg-[#0C1E4F] text-white shadow-md shadow-[#0C1E4F]/30'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {val} <span className="opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Stats Bar */}
        {selectedEntityId && (
          <div className="px-8 py-2.5 flex items-center justify-between border-b border-slate-100 bg-white/50 text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0">
            <div className="flex items-center gap-5">
              <span className="flex items-center gap-1.5"><Layers size={11} className="text-[#0C1E4F]" /> {data.length}{totalCount > data.length ? ` / ${totalCount.toLocaleString()}` : ''} Total</span>
              <span className="flex items-center gap-1.5"><Filter size={11} /> {filteredData.length} Filtrados</span>
              <span className="flex items-center gap-1.5"><CheckSquare size={11} className="text-blue-500" /> {selectedRows.size} Sel.</span>
              {hiddenColumns.size > 0 && (
                <span className="flex items-center gap-1.5 text-amber-500"><EyeOff size={11} /> {hiddenColumns.size} ocultas</span>
              )}
            </div>
            <div className="flex items-center gap-4">
              {totalCount > data.length && !isLoading && (
                <button
                  onClick={() => { const next = page + 1; setPage(next); loadData(selectedEntityId, next); }}
                  className="px-3 py-1 bg-[#0C1E4F] text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:opacity-80 transition-all"
                >
                  Cargar más ({(totalCount - data.length).toLocaleString()} restantes)
                </button>
              )}
              <div className="flex items-center gap-2 italic opacity-60">
                <Info size={11} /> Shift+Clic para rangos
              </div>
            </div>
          </div>
        )}

        {/* Tabla */}
        <div className="flex-1 overflow-auto p-8 scrollbar-premium">
          {isLoading ? (
            <div className="h-60 flex items-center justify-center gap-3 text-slate-300">
              <Loader2 className="animate-spin" size={28} />
              <span className="font-bold text-sm">Cargando...</span>
            </div>
          ) : !selectedEntityId ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-40">
              <div className="w-20 h-20 bg-slate-100 rounded-[2rem] flex items-center justify-center text-slate-300 shadow-inner">
                <Database size={40} />
              </div>
              <div className="max-w-xs">
                <p className="text-lg font-black text-slate-800 italic uppercase">Editor de Datos</p>
                <p className="text-xs font-bold text-slate-400 mt-2">Selecciona una tabla para editar sus registros.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-10 pb-20">
              {Object.entries(groupedData).map(([groupKey, groupRows]) => (
                <div key={groupKey} className="space-y-3">
                  {groupBy && (
                    <div className="flex items-center gap-4 px-4">
                      <button
                        onClick={() => handleSelectGroup(groupRows)}
                        className={`p-1.5 rounded-xl transition-all ${
                          groupRows.every(r => selectedRows.has(r.id)) ? 'bg-[#0C1E4F] text-white' : 'bg-white text-slate-300 border border-slate-200'
                        }`}
                      >
                        {groupRows.every(r => selectedRows.has(r.id)) ? <CheckSquare size={14} /> : <Square size={14} />}
                      </button>
                      <div className="h-3.5 w-1 bg-[#0C1E4F] rounded-full" />
                      <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">
                        {groupBy}: <span className="text-[#0C1E4F] italic">{groupKey}</span>
                      </h3>
                      <span className="text-[10px] font-bold text-slate-300">({groupRows.length})</span>
                    </div>
                  )}

                  <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50/80 sticky top-0 z-10 backdrop-blur-sm">
                          <tr>
                            <th className="px-5 py-4 w-10 border-b border-slate-100 sticky left-0 bg-slate-50/90">
                              <button onClick={selectAll} className="p-1 hover:bg-slate-200 rounded-lg transition-colors">
                                {selectedRows.size === filteredData.length && filteredData.length > 0
                                  ? <CheckSquare size={16} className="text-[#0C1E4F]" />
                                  : <Square size={16} className="text-slate-300" />}
                              </button>
                            </th>
                            {visibleColumns.map(col => (
                              <th key={col} className={`px-5 py-4 text-[10px] font-black uppercase tracking-widest border-b border-slate-100 whitespace-nowrap ${
                                col === cwpColumn ? 'text-[#0C1E4F]' : 'text-slate-400'
                              }`}>
                                <div className="flex items-center gap-1.5">
                                  {col === cwpColumn && <Tag size={9} />}
                                  {col}
                                </div>
                              </th>
                            ))}
                          </tr>
                          {/* ─── Fila de filtros por columna ─── */}
                          {showColumnFilters && (
                            <tr className="bg-white border-b border-slate-100">
                              <td className="px-5 py-2 sticky left-0 bg-white" />
                              {visibleColumns.map(col => (
                                <td key={col} className="px-3 py-2">
                                  <input
                                    type="text"
                                    value={columnFilters[col] || ''}
                                    onChange={e => setColumnFilters(prev => ({ ...prev, [col]: e.target.value }))}
                                    placeholder="Filtrar..."
                                    className={`w-full px-2.5 py-1.5 bg-slate-50 border rounded-lg text-[9px] font-medium outline-none transition-all ${
                                      columnFilters[col] ? 'border-[#0C1E4F] bg-blue-50/30' : 'border-slate-200 focus:border-brand-electric'
                                    }`}
                                  />
                                </td>
                              ))}
                            </tr>
                          )}
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {groupRows.map((row) => {
                            const isEdited = !!editedRecords[row.id];
                            const isSelected = selectedRows.has(row.id);
                            return (
                              <tr
                                key={row.id}
                                className={`group transition-all hover:bg-slate-50/80 ${isSelected ? 'bg-blue-50/30' : ''} ${isEdited ? 'bg-amber-50/20' : ''}`}
                              >
                                <td className="px-5 py-3 sticky left-0 bg-inherit">
                                  <button
                                    onClick={(e) => handleSelectRow(row.id, e.shiftKey)}
                                    className={`p-1 rounded-lg transition-colors ${isSelected ? 'text-[#0C1E4F]' : 'text-slate-200 group-hover:text-slate-300'}`}
                                  >
                                    {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                                  </button>
                                </td>
                                {visibleColumns.map(col => (
                                  <td key={col} className="px-5 py-3">
                                    <input
                                      type="text"
                                      value={editedRecords[row.id] ? (editedRecords[row.id][col] ?? '') : (row[col] ?? '')}
                                      onChange={(e) => handleEdit(row.id, col, e.target.value)}
                                      className={`w-full bg-transparent border-none outline-none text-xs transition-all font-medium min-w-[80px] ${
                                        isEdited ? 'text-amber-700 font-bold' : col === cwpColumn ? 'text-[#0C1E4F] font-bold' : 'text-slate-600'
                                      } hover:bg-slate-100 p-1.5 rounded-lg focus:bg-white focus:shadow-inner focus:ring-1 focus:ring-brand-electric/20`}
                                    />
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── PANEL DERECHO: Visibilidad de Columnas ─── */}
      {showColumnPanel && (
        <div className="w-60 shrink-0 bg-white border-l border-slate-100 flex flex-col overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Columnas</span>
            <button onClick={() => setShowColumnPanel(false)} className="text-slate-300 hover:text-slate-500 transition-colors">
              <X size={14} />
            </button>
          </div>
          <div className="px-3 py-2 border-b border-slate-50">
            <div className="flex gap-2">
              <button
                onClick={() => setHiddenColumns(new Set())}
                className="flex-1 py-1.5 text-[9px] font-black text-[#0C1E4F] uppercase tracking-wider hover:bg-blue-50 rounded-lg transition-all"
              >
                Mostrar Todas
              </button>
              <button
                onClick={() => setHiddenColumns(new Set(columns))}
                className="flex-1 py-1.5 text-[9px] font-black text-slate-400 uppercase tracking-wider hover:bg-slate-50 rounded-lg transition-all"
              >
                Ocultar Todas
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
            {columns.map(col => {
              const isHidden = hiddenColumns.has(col);
              return (
                <button
                  key={col}
                  onClick={() => setHiddenColumns(prev => {
                    const next = new Set(prev);
                    if (next.has(col)) next.delete(col);
                    else next.add(col);
                    return next;
                  })}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[10px] font-bold transition-all ${
                    isHidden ? 'text-slate-300' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {isHidden
                    ? <EyeOff size={11} className="text-slate-200 shrink-0" />
                    : <Eye size={11} className={col === cwpColumn ? 'text-[#0C1E4F] shrink-0' : 'text-slate-400 shrink-0'} />
                  }
                  <span className={`truncate ${col === cwpColumn ? 'text-[#0C1E4F] font-black' : ''}`}>{col}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <style jsx>{`
        .scrollbar-premium::-webkit-scrollbar { width: 6px; height: 6px; }
        .scrollbar-premium::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-premium::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .scrollbar-premium::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
}
