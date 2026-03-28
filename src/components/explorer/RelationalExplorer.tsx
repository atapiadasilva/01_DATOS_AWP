'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Database, Plus, X, ChevronRight, Layers, Search, ArrowRight, Check, Loader2, Download, Save, Tag, Filter } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import { useCwpFilter } from '@/hooks/useCwpFilter';
import type { EntityWithAttributes, RelationshipWithAttrs } from '@/types';

interface RelationalExplorerProps {
  entities: EntityWithAttributes[];
  relationships: RelationshipWithAttrs[];
  onRefresh?: () => void;
}

interface SelectedColumn {
  entityId: string;
  entityName: string;
  column: string;
}

export default function RelationalExplorer({ entities, relationships, onRefresh }: RelationalExplorerProps) {
  const [baseEntityId, setBaseEntityId] = useState('');
  const [baseData, setBaseData] = useState<any[]>([]);
  const [baseColumns, setBaseColumns] = useState<string[]>([]);
  const [selectedBaseColumns, setSelectedBaseColumns] = useState<string[]>([]);
  const [selectedExtraColumns, setSelectedExtraColumns] = useState<SelectedColumn[]>([]);
  const [relatedEntityData, setRelatedEntityData] = useState<Record<string, any[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [columnSearch, setColumnSearch] = useState('');
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set());

  // ─── Filtrado sobre la tabla resultante ─────────────────────────────
  const [tableFilter, setTableFilter] = useState('');
  const [cwpFilter, setCwpFilter] = useState('');

  // ─── Guardar como Vista Personalizada ───────────────────────────────
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveViewName, setSaveViewName] = useState('');
  const [isSavingView, setIsSavingView] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ─── Carga paginada ──────────────────────────────────────────────────
  const fetchAllRecords = async (entityId: string) => {
    let allRecords: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from('data_records')
        .select('id, data')
        .eq('entity_id', entityId)
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) { console.error(error); break; }
      if (data && data.length > 0) {
        allRecords = [...allRecords, ...data.map(r => ({ __id: r.id, ...r.data }))];
        hasMore = data.length === pageSize;
        page++;
      } else {
        hasMore = false;
      }
    }
    return allRecords;
  };

  // ─── Entidades alcanzables (BFS) ─────────────────────────────────────
  const reachableEntities = useMemo(() => {
    if (!baseEntityId) return [];
    const reached = new Map<string, { entity: any; joinKey: { parentCol: string; childCol: string; targetEntityId: string }; path: string[] }>();
    const queue: string[] = [baseEntityId];
    const visited = new Set<string>([baseEntityId]);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      relationships.forEach(rel => {
        const pId = rel.parent_attribute_id ? rel.parent_attr?.entity_id : null;
        const cId = rel.child_attribute_id ? rel.child_attr?.entity_id : null;
        const pCol = rel.parent_attr?.name;
        const cCol = rel.child_attr?.name;

        if (pId === currentId && cId && !visited.has(cId)) {
          visited.add(cId);
          const ent = entities.find(e => e.id === cId);
          if (ent) {
            reached.set(cId, {
              entity: ent,
              joinKey: { parentCol: pCol, childCol: cCol, targetEntityId: currentId },
              path: [...(reached.get(currentId)?.path || []), currentId]
            });
            queue.push(cId);
          }
        } else if (cId === currentId && pId && !visited.has(pId)) {
          visited.add(pId);
          const ent = entities.find(e => e.id === pId);
          if (ent) {
            reached.set(pId, {
              entity: ent,
              joinKey: { parentCol: cCol, childCol: pCol, targetEntityId: currentId },
              path: [...(reached.get(currentId)?.path || []), currentId]
            });
            queue.push(pId);
          }
        }
      });
    }
    return Array.from(reached.values());
  }, [baseEntityId, relationships, entities]);

  useEffect(() => {
    if (!baseEntityId) {
      setBaseData([]); setBaseColumns([]); setSelectedBaseColumns([]);
      setSelectedExtraColumns([]); setRelatedEntityData({}); setTableFilter(''); setCwpFilter('');
      return;
    }
    setIsLoading(true);
    fetchAllRecords(baseEntityId).then(data => {
      if (data && data.length > 0) {
        setBaseData(data);
        const cols = Array.from(new Set(data.flatMap(r => Object.keys(r).filter(k => !k.startsWith('_batch') && k !== '__id'))));
        setBaseColumns(cols.sort());
        setSelectedBaseColumns(cols.slice(0, 8));
      } else {
        setBaseData([]); setBaseColumns([]);
      }
      setIsLoading(false);
    });
  }, [baseEntityId]);

  const ensureRelatedData = async (entityId: string) => {
    if (relatedEntityData[entityId]) return;
    const data = await fetchAllRecords(entityId);
    if (data) setRelatedEntityData(prev => ({ ...prev, [entityId]: data }));
  };

  const addExtraColumn = async (entityId: string, entityName: string, column: string) => {
    if (selectedExtraColumns.find(c => c.entityId === entityId && c.column === column)) return;
    await ensureRelatedData(entityId);
    setSelectedExtraColumns(prev => [...prev, { entityId, entityName, column }]);
  };

  const removeExtraColumn = (entityId: string, column: string) => {
    setSelectedExtraColumns(prev => prev.filter(c => !(c.entityId === entityId && c.column === column)));
  };

  const toggleBaseColumn = (col: string) => {
    setSelectedBaseColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  };

  // ─── JOIN con Maps ───────────────────────────────────────────────────
  const joinedRows = useMemo(() => {
    const indexes: Record<string, Map<string, any>> = {};
    selectedExtraColumns.forEach(({ entityId }) => {
      if (indexes[entityId]) return;
      const rel = reachableEntities.find(r => r.entity.id === entityId);
      if (!rel) return;
      const { childCol } = rel.joinKey;
      const data = relatedEntityData[entityId] || [];
      const map = new Map();
      data.forEach(row => {
        const val = String(row[childCol] ?? '').trim().toLowerCase();
        if (val) map.set(val, row);
      });
      indexes[entityId] = map;
    });

    return baseData.map(baseRow => {
      const merged: any = { ...baseRow };
      selectedExtraColumns.forEach(({ entityId, column }) => {
        const rel = reachableEntities.find(r => r.entity.id === entityId);
        if (!rel) return;
        const { parentCol } = rel.joinKey;
        const joinVal = String(baseRow[parentCol] ?? '').trim().toLowerCase();
        const matchRow = indexes[entityId]?.get(joinVal);
        merged[`${entityId}::${column}`] = matchRow?.[column] ?? '—';
      });
      return merged;
    });
  }, [baseData, selectedExtraColumns, relatedEntityData, reachableEntities]);

  // ─── CWP column detection ────────────────────────────────────────────
  const { cwpColumn, cwpValues } = useCwpFilter(
    useMemo(() => [...selectedBaseColumns, ...selectedExtraColumns.map(c => c.column)], [selectedBaseColumns, selectedExtraColumns]),
    joinedRows
  );

  // ─── Filtrado sobre resultados ───────────────────────────────────────
  const filteredJoinedRows = useMemo(() => {
    const allCols = [
      ...selectedBaseColumns,
      ...selectedExtraColumns.map(c => `${c.entityId}::${c.column}`)
    ];
    let result = joinedRows;

    if (cwpFilter && cwpColumn) {
      result = result.filter(row => String(row[cwpColumn] || '') === cwpFilter);
    }

    if (tableFilter) {
      const q = tableFilter.toLowerCase();
      result = result.filter(row =>
        allCols.some(col => String(row[col] ?? '').toLowerCase().includes(q))
      );
    }

    return result;
  }, [joinedRows, cwpFilter, cwpColumn, tableFilter, selectedBaseColumns, selectedExtraColumns]);

  // ─── Guardar como Vista ──────────────────────────────────────────────
  const handleSaveAsView = async () => {
    if (!saveViewName.trim() || !baseEntityId || selectedBaseColumns.length === 0) return;
    setIsSavingView(true);
    try {
      const detectedFilterKey = cwpColumn
        || selectedBaseColumns.find(c => ['EDT', 'WBS', 'PACKAGE', 'PAQUETE'].includes(c.toUpperCase().trim()))
        || null;

      const { error } = await supabase.from('custom_views').insert({
        name: saveViewName.trim(),
        entity_id: baseEntityId,
        columns: [...selectedBaseColumns, ...selectedExtraColumns.map(c => `JOIN::${c.entityId}::${c.column}`)],
        filter_key: detectedFilterKey || null,
        definition: {
          baseEntityId,
          selectedBaseColumns,
          selectedExtraColumns,
          reachableEntities: reachableEntities.map(re => ({
            id: re.entity.id,
            name: re.entity.name,
            joinKey: re.joinKey
          }))
        }
      });

      if (!error) {
        setSaveSuccess(true);
        setSaveViewName('');
        setTimeout(() => { setSaveSuccess(false); setShowSaveModal(false); }, 1500);
        onRefresh?.();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingView(false);
    }
  };

  const handleExportExcel = () => {
    if (filteredJoinedRows.length === 0) return;
    const exportData = filteredJoinedRows.map(row => {
      const cleanRow: any = {};
      [...selectedBaseColumns, ...selectedExtraColumns.map(c => `${c.entityId}::${c.column}`)].forEach(col => {
        cleanRow[getColumnLabel(col)] = row[col];
      });
      return cleanRow;
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SuperTabla_AWP');
    XLSX.writeFile(wb, `AWP_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const allDisplayColumns = [
    ...selectedBaseColumns,
    ...selectedExtraColumns.map(c => `${c.entityId}::${c.column}`)
  ];

  const getColumnLabel = (col: string) => {
    if (!col.includes('::')) return col;
    const [entityId, column] = col.split('::');
    const ent = entities.find(e => e.id === entityId);
    return `${ent?.name?.slice(0, 12) ?? '?'} › ${column}`;
  };

  const getColumnColor = (col: string) => {
    if (!col.includes('::')) return col === cwpColumn ? 'bg-[#F0F4F7] text-[#0C1E4F]' : 'bg-slate-100 text-slate-600';
    const [entityId] = col.split('::');
    const colors = ['bg-blue-50 text-blue-600', 'bg-purple-50 text-purple-600', 'bg-amber-50 text-amber-700', 'bg-rose-50 text-rose-600', 'bg-teal-50 text-teal-600'];
    const idx = entities.findIndex(e => e.id === entityId) % colors.length;
    return colors[idx];
  };

  const baseEntity = entities.find(e => e.id === baseEntityId);

  const filteredReachableEntities = useMemo(() => {
    if (!columnSearch) return reachableEntities;
    return reachableEntities.map(re => {
      const relData = relatedEntityData[re.entity.id] || [];
      const relCols = relData.length > 0
        ? Array.from(new Set(relData.flatMap(r => Object.keys(r).filter(k => !k.startsWith('_batch') && k !== '__id'))))
        : (re.entity.attributes?.map((a: any) => a.name) || []);
      const matchingCols = relCols.filter((c: string) => c.toLowerCase().includes(columnSearch.toLowerCase()));
      if (re.entity.name.toLowerCase().includes(columnSearch.toLowerCase()) || matchingCols.length > 0) {
        return { ...re, matchingCols };
      }
      return null;
    }).filter(Boolean) as any[];
  }, [reachableEntities, columnSearch, relatedEntityData]);

  const displayRows = filteredJoinedRows.slice(0, 500);
  const hasMore = filteredJoinedRows.length > 500;

  return (
    <div className="flex h-full gap-0 overflow-hidden relative">
      {/* ─── PANEL IZQUIERDO ─── */}
      <div className="w-72 shrink-0 bg-white border-r border-slate-100 flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-100 space-y-3">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Tabla Raíz</h4>
          <select
            value={baseEntityId}
            onChange={e => setBaseEntityId(e.target.value)}
            className="w-full text-xs font-bold p-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:border-brand-electric transition-colors"
          >
            <option value="">Seleccionar inicio de cadena...</option>
            {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>

          {baseEntityId && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={11} />
              <input
                type="text"
                placeholder="Buscar columna o tabla..."
                value={columnSearch}
                onChange={e => setColumnSearch(e.target.value)}
                className="w-full text-[10px] font-bold pl-8 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-lg outline-none focus:border-brand-electric"
              />
            </div>
          )}
        </div>

        {baseEntityId && (
          <div className="flex-1 overflow-y-auto">
            {/* Columnas base */}
            <div className="p-4 border-b border-slate-50">
              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Database size={9} /> {baseEntity?.name}
              </p>
              <div className="space-y-0.5">
                {baseColumns.filter(c => !c.startsWith('_batch')).map(col => (
                  <button key={col}
                    onClick={() => toggleBaseColumn(col)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[10px] font-bold transition-all ${
                      selectedBaseColumns.includes(col) ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`truncate flex items-center gap-1.5 ${col === cwpColumn ? 'text-[#0C1E4F]' : ''}`}>
                      {col === cwpColumn && <Tag size={9} />}
                      {col}
                    </span>
                    {selectedBaseColumns.includes(col) && <Check size={10} className="shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Tablas relacionadas */}
            {filteredReachableEntities.length > 0 && (
              <div className="p-4">
                <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <ArrowRight size={9} /> Tablas Conectadas ({filteredReachableEntities.length})
                </p>
                {filteredReachableEntities.map(({ entity, joinKey, path }) => {
                  const isExpanded = expandedEntities.has(entity.id) || !!columnSearch;
                  const relData = relatedEntityData[entity.id] || [];
                  const relCols = relData.length > 0
                    ? Array.from(new Set(relData.flatMap(r => Object.keys(r).filter(k => !k.startsWith('_batch') && k !== '__id'))))
                    : (entity.attributes?.map((a: any) => a.name) || []);
                  const colors = ['border-blue-200 bg-blue-50/50', 'border-purple-200 bg-purple-50/50', 'border-amber-200 bg-amber-50/50', 'border-rose-200 bg-rose-50/50', 'border-teal-200 bg-teal-50/50'];
                  const colorIdx = entities.findIndex(e => e.id === entity.id) % colors.length;

                  return (
                    <div key={entity.id} className={`rounded-2xl border mb-2 overflow-hidden ${colors[colorIdx]}`}>
                      <button
                        onClick={async () => {
                          if (!isExpanded) await ensureRelatedData(entity.id);
                          setExpandedEntities(prev => {
                            const next = new Set(prev);
                            isExpanded ? next.delete(entity.id) : next.add(entity.id);
                            return next;
                          });
                        }}
                        className="w-full flex items-center justify-between px-4 py-2.5"
                      >
                        <div className="text-left">
                          <p className="text-[10px] font-black text-slate-700 truncate">{entity.name}</p>
                          <p className="text-[9px] text-slate-400 font-bold">
                            Vía: {joinKey.parentCol} = {joinKey.childCol}
                          </p>
                        </div>
                        <ChevronRight size={12} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </button>
                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-0.5">
                          {relCols.filter((c: string) => !columnSearch || c.toLowerCase().includes(columnSearch.toLowerCase())).map((col: string) => {
                            const isAdded = selectedExtraColumns.some(c => c.entityId === entity.id && c.column === col);
                            return (
                              <button key={col}
                                onClick={() => isAdded ? removeExtraColumn(entity.id, col) : addExtraColumn(entity.id, entity.name, col)}
                                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                  isAdded ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:bg-white/70'
                                }`}
                              >
                                <span className="truncate">{col}</span>
                                {isAdded ? <X size={9} className="text-red-400 shrink-0" /> : <Plus size={9} className="shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {reachableEntities.length === 0 && baseEntityId && (
              <div className="p-6 text-center">
                <p className="text-[10px] text-slate-300 italic font-bold">No hay relaciones definidas. Defínelas en el Mapa Nodal.</p>
              </div>
            )}
          </div>
        )}

        {!baseEntityId && (
          <div className="flex-1 flex items-center justify-center p-6">
            <p className="text-[10px] text-slate-300 text-center italic font-bold">Selecciona una tabla base para construir tu vista cruzada.</p>
          </div>
        )}
      </div>

      {/* ─── ÁREA PRINCIPAL ─── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">

        {/* Chips de columnas activas */}
        {allDisplayColumns.length > 0 && (
          <div className="shrink-0 px-5 py-3 bg-white border-b border-slate-100 flex items-center gap-2.5 overflow-x-auto">
            <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest shrink-0">Activas</span>
            {allDisplayColumns.map(col => (
              <span key={col} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black whitespace-nowrap ${getColumnColor(col)}`}>
                {col === cwpColumn && <Tag size={8} />}
                {getColumnLabel(col)}
                {col.includes('::') && (
                  <button onClick={() => { const [eid, c] = col.split('::'); removeExtraColumn(eid, c); }} className="hover:opacity-60">
                    <X size={8} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Barra de filtros y acciones sobre la tabla */}
        {baseEntityId && (
          <div className="shrink-0 px-5 py-3 bg-white border-b border-slate-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              {/* Filtro general sobre resultados */}
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={12} />
                <input
                  type="text"
                  placeholder="Filtrar resultados..."
                  value={tableFilter}
                  onChange={e => setTableFilter(e.target.value)}
                  className="w-full pl-8 pr-8 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-bold outline-none focus:border-brand-electric"
                />
                {tableFilter && (
                  <button onClick={() => setTableFilter('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                    <X size={10} />
                  </button>
                )}
              </div>

              {/* CWP quick filter */}
              {cwpColumn && cwpValues.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto max-w-md">
                  <Tag size={11} className="text-[#0C1E4F] shrink-0" />
                  <button
                    onClick={() => setCwpFilter('')}
                    className={`px-3 py-1.5 rounded-full text-[9px] font-black shrink-0 transition-all ${!cwpFilter ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    Todos
                  </button>
                  {cwpValues.slice(0, 8).map(val => (
                    <button
                      key={val}
                      onClick={() => setCwpFilter(cwpFilter === val ? '' : val)}
                      className={`px-3 py-1.5 rounded-full text-[9px] font-black shrink-0 transition-all ${cwpFilter === val ? 'bg-[#0C1E4F] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Stats */}
              <p className="text-[10px] font-black text-slate-400 hidden sm:block">
                {isLoading ? 'Cargando...' : `${filteredJoinedRows.length} filas`}
                {hasMore && <span className="text-amber-500"> (mostrando 500)</span>}
              </p>

              {/* Guardar como Vista */}
              {selectedBaseColumns.length > 0 && (
                <button
                  onClick={() => setShowSaveModal(true)}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:bg-slate-800 transition-all"
                >
                  <Save size={13} /> Guardar Vista
                </button>
              )}

              {/* Exportar */}
              {filteredJoinedRows.length > 0 && (
                <button
                  onClick={handleExportExcel}
                  className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 border border-blue-100 hover:bg-blue-100 transition-all"
                >
                  <Download size={13} /> Excel
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tabla de resultados */}
        <div className="flex-1 overflow-auto px-5 pb-5">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 gap-3 text-slate-300">
              <Loader2 className="animate-spin" size={22} />
              <span className="font-bold text-sm">Cargando datos...</span>
            </div>
          ) : displayRows.length > 0 && allDisplayColumns.length > 0 ? (
            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto max-h-[calc(100vh-300px)] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                      {allDisplayColumns.map(col => (
                        <th key={col} className="px-4 py-3 border-b border-slate-100 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wide ${getColumnColor(col)}`}>
                            {col === cwpColumn && <Tag size={8} />}
                            {getColumnLabel(col)}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {displayRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        {allDisplayColumns.map(col => (
                          <td key={col} className="px-4 py-2.5 max-w-[200px]">
                            <span className={`block truncate ${!row[col] || row[col] === '—' ? 'text-slate-300 italic text-[9px]' : col === cwpColumn ? 'text-[#0C1E4F] font-bold text-[11px]' : 'text-slate-700'}`}>
                              {row[col] !== null && row[col] !== undefined ? String(row[col]) : '—'}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasMore && (
                <div className="px-6 py-3 bg-amber-50 border-t border-amber-100 text-center">
                  <p className="text-[10px] font-black text-amber-600">Mostrando 500 de {filteredJoinedRows.length} filas. Exporta a Excel para ver todas.</p>
                </div>
              )}
            </div>
          ) : baseEntityId && !isLoading ? (
            <div className="flex flex-col items-center justify-center h-60 gap-4 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200"><Layers size={30} /></div>
              <p className="text-slate-300 font-bold text-sm italic">
                {allDisplayColumns.length === 0
                  ? 'Selecciona columnas del panel izquierdo para construir tu super tabla.'
                  : 'Sin resultados con los filtros actuales.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-60 gap-4 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200"><Database size={30} /></div>
              <p className="text-slate-300 font-bold text-sm italic">Selecciona una tabla base para comenzar.</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── MODAL: Guardar como Vista ─── */}
      {showSaveModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] shadow-2xl p-10 w-full max-w-md space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black italic text-slate-900">Guardar como Vista</h3>
              <button onClick={() => setShowSaveModal(false)} className="text-slate-300 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Nombre de la Vista</label>
                <input
                  type="text"
                  value={saveViewName}
                  onChange={e => setSaveViewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveAsView()}
                  placeholder="Ej: Programa General, Log de Planos..."
                  autoFocus
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-brand-electric transition-all"
                />
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl space-y-1.5">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Configuración detectada</p>
                <p className="text-[11px] font-bold text-slate-600">Tabla base: <span className="text-slate-900">{baseEntity?.name}</span></p>
                <p className="text-[11px] font-bold text-slate-600">Columnas: <span className="text-slate-900">{selectedBaseColumns.length} seleccionadas</span></p>
                {cwpColumn && <p className="text-[11px] font-bold text-[#0C1E4F]">Filtro CWP detectado: <span className="font-black">{cwpColumn}</span></p>}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowSaveModal(false)} className="flex-1 py-3 text-slate-400 font-black text-[10px] uppercase tracking-widest">
                Cancelar
              </button>
              <button
                onClick={handleSaveAsView}
                disabled={!saveViewName.trim() || isSavingView || saveSuccess}
                className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                  saveSuccess ? 'bg-[#0C1E4F] text-white' : 'bg-slate-900 text-white hover:bg-slate-800'
                } disabled:opacity-50`}
              >
                {saveSuccess ? <><Check size={14} /> Guardada</> : isSavingView ? <Loader2 className="animate-spin" size={14} /> : <><Save size={14} /> Guardar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
