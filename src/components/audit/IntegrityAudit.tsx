'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Activity, X, Search, Check, Trash2, AlertCircle, ChevronDown, ChevronRight, Loader2, Database, ArrowRightLeft, Info, CheckSquare, Square, Network, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface IntegrityAuditProps {
  relationships: any[];
  entities: any[];
}

interface AuditResult {
  relationshipId: string;
  parentEntityName: string;
  childEntityName: string;
  parentOrphans: any[]; // Registros en Parent sin match en Child
  childOrphans: any[];  // Registros en Child sin match en Parent
  parentTotal: number;
  childTotal: number;
  isLoading: boolean;
}

export default function IntegrityAudit({ relationships, entities }: IntegrityAuditProps) {
  const [auditData, setAuditData] = useState<Record<string, AuditResult>>({});
  const [selectedOrphanView, setSelectedOrphanView] = useState<{
    relId: string;
    direction: 'parent' | 'child';
    orphans: any[];
    entityName: string;
  } | null>(null);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ recordId: string; field: string; value: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [auditProgress, setAuditProgress] = useState<Record<string, string>>({});

  // ─── Ayudante para cargar TODOS los registros de una entidad ───────────
  const fetchAllRecords = async (entityId: string, relId: string, side: 'parent' | 'child') => {
    let allRecords: any[] = [];
    let from = 0;
    let to = 999;
    let finished = false;

    while (!finished) {
      setAuditProgress(prev => ({ 
        ...prev, 
        [`${relId}-${side}`]: `Cargando ${allRecords.length > 0 ? allRecords.length : ''}...` 
      }));

      const { data, error, count } = await supabase
        .from('data_records')
        .select('id, data', { count: 'exact' })
        .eq('entity_id', entityId)
        .range(from, to)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        allRecords = [...allRecords, ...data];
        if (data.length < 1000) finished = true;
        else {
          from += 1000;
          to += 1000;
        }
      } else {
        finished = true;
      }
    }
    
    setAuditProgress(prev => {
      const next = { ...prev };
      delete next[`${relId}-${side}`];
      return next;
    });

    return allRecords;
  };

  // ─── Función para ejecutar auditoría en una relación ───────────────────────
  const runSingleAudit = async (rel: any) => {
    setAuditData(prev => ({
      ...prev,
      [rel.id]: {
        ...prev[rel.id],
        isLoading: true,
        relationshipId: rel.id,
        parentEntityName: rel.parent_attr?.entity?.name || '?',
        childEntityName: rel.child_attr?.entity?.name || '?',
        parentOrphans: [],
        childOrphans: [],
        parentTotal: 0,
        childTotal: 0
      }
    }));

    try {
      const parentEntityId = rel.parent_attr?.entity?.id;
      const childEntityId = rel.child_attr?.entity?.id;
      const parentCol = rel.parent_attr?.name;
      const childCol = rel.child_attr?.name;

      // 1. Fetch de datasets completos mediante paginación
      const [parentRaw, childRaw] = await Promise.all([
        fetchAllRecords(parentEntityId, rel.id, 'parent'),
        fetchAllRecords(childEntityId, rel.id, 'child')
      ]);

      const parentRows = parentRaw.map(r => ({ __record_id: r.id, ...r.data }));
      const childRows = childRaw.map(r => ({ __record_id: r.id, ...r.data }));

      // 2. Identificar huérfanos Parent -> Child
      const childKeys = new Set(childRows.map(r => String(r[childCol] ?? '').trim().toLowerCase()));
      const parentOrphans = parentRows.filter(r => {
        const key = String(r[parentCol] ?? '').trim().toLowerCase();
        return !childKeys.has(key);
      });

      // 3. Identificar huérfanos Child -> Parent
      const parentKeys = new Set(parentRows.map(r => String(r[parentCol] ?? '').trim().toLowerCase()));
      const childOrphans = childRows.filter(r => {
        const key = String(r[childCol] ?? '').trim().toLowerCase();
        return !parentKeys.has(key);
      });

      setAuditData(prev => ({
        ...prev,
        [rel.id]: {
          ...prev[rel.id],
          isLoading: false,
          parentOrphans,
          childOrphans,
          parentTotal: parentRows.length,
          childTotal: childRows.length
        }
      }));
    } catch (error) {
      console.error('Error en auditoría:', error);
      setAuditData(prev => ({ ...prev, [rel.id]: { ...prev[rel.id], isLoading: false } }));
    }
  };

  // ─── Ejecutar auditoría inicial ────────────────────────────────────────────
  useEffect(() => {
    relationships.forEach(rel => {
      if (!auditData[rel.id]) runSingleAudit(rel);
    });
  }, [relationships]);

  // ─── Gestión de eliminación ───────────────────────────────────────────────
  const toggleRecordSelection = (id: string) => {
    const next = new Set(selectedRecords);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRecords(next);
  };

  const handleBulkDelete = async () => {
    if (selectedRecords.size === 0) return;
    if (!confirm(`¿Eliminar ${selectedRecords.size} registros permanentemente de Supabase?`)) return;

    setIsDeleting(true);
    const idsToDelete = Array.from(selectedRecords);
    
    // Deletions usually handled in batches if size > 100
    const { error } = await supabase.from('data_records').delete().in('id', idsToDelete);

    if (!error) {
      // Actualizar estado local eliminando los registros de los huérfanos
      setAuditData(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(relId => {
          next[relId].parentOrphans = next[relId].parentOrphans.filter(r => !selectedRecords.has(r.__record_id));
          next[relId].childOrphans = next[relId].childOrphans.filter(r => !selectedRecords.has(r.__record_id));
        });
        return next;
      });
      if (selectedOrphanView) {
        setSelectedOrphanView(prev => prev ? {
          ...prev,
          orphans: prev.orphans.filter(r => !selectedRecords.has(r.__record_id))
        } : null);
      }
      setSelectedRecords(new Set());
    } else {
      alert('Error al eliminar registros: ' + error.message);
    }
    setIsDeleting(false);
  };

  // ─── Guardar edición de Celda ──────────────────────────────────────────
  const handleSaveCell = async () => {
    if (!editingCell || !selectedOrphanView) return;

    const { recordId, field, value } = editingCell;
    
    const { error } = await supabase
      .from('data_records')
      .update({ data: { 
        ...selectedOrphanView.orphans.find(r => r.__record_id === recordId),
        [field]: value 
      } })
      .eq('id', recordId);

    if (!error) {
      // Actualizar localmente
      setAuditData(prev => {
        const next = { ...prev };
        const rel = next[selectedOrphanView.relId];
        const list = selectedOrphanView.direction === 'parent' ? rel.parentOrphans : rel.childOrphans;
        const idx = list.findIndex(r => r.__record_id === recordId);
        if (idx !== -1) list[idx][field] = value;
        return next;
      });
      setSelectedOrphanView(prev => {
        if (!prev) return null;
        const nextOrphans = [...prev.orphans];
        const idx = nextOrphans.findIndex(r => r.__record_id === recordId);
        if (idx !== -1) nextOrphans[idx][field] = value;
        return { ...prev, orphans: nextOrphans };
      });
      setEditingCell(null);
    } else {
      alert('Error al guardar cambio: ' + error.message);
    }
  };

  // ─── Obtener todas las columnas únicas (limitado a muestra para performance) ──
  const allAvailableColumns = useMemo(() => {
    if (!selectedOrphanView) return [];
    const keys = new Set<string>();
    // Analizar los primeros 100 para capturar columnas desfasadas
    selectedOrphanView.orphans.slice(0, 100).forEach(row => {
      Object.keys(row).forEach(k => {
        if (k !== '__record_id' && !k.startsWith('_batch')) {
          keys.add(k);
        }
      });
    });
    return Array.from(keys).sort();
  }, [selectedOrphanView]);

  return (
    <div className="space-y-8 h-full flex flex-col overflow-hidden pb-10 px-4">
      <div className="flex justify-between items-end shrink-0 pt-4">
        <div>
          <h3 className="text-5xl font-black text-slate-900 tracking-tighter mb-2 italic">Auditoría de Conexiones</h3>
          <p className="text-sm text-slate-500 font-bold uppercase tracking-widest">Análisis bidireccional de integridad y trazabilidad.</p>
        </div>
        <div className="flex gap-4">
           <button onClick={() => relationships.forEach(runSingleAudit)} className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition-all">
             <ArrowRightLeft size={16} /> Re-auditar Todo
           </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-8 custom-scrollbar pb-10">
        {relationships.map(rel => {
          const res = auditData[rel.id];
          if (!res) return null;

          const pOrphans = res.parentOrphans.length;
          const cOrphans = res.childOrphans.length;
          const pMatches = res.parentTotal - pOrphans;
          const cMatches = res.childTotal - cOrphans;
          const pIntegrity = res.parentTotal > 0 ? (pMatches / res.parentTotal) * 100 : 100;
          const cIntegrity = res.childTotal > 0 ? (cMatches / res.childTotal) * 100 : 100;

          return (
            <div key={rel.id} className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden group hover:shadow-2xl transition-all duration-500">
              {/* Header Relación */}
              <div className="p-8 border-b border-slate-50 bg-slate-50/20 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                   <div className="w-14 h-14 bg-white border-2 border-[#1E3A8A]/10 rounded-2xl flex items-center justify-center text-[#1E3A8A] shadow-sm transform group-hover:scale-110 transition-transform">
                     <Network size={28} />
                   </div>
                   <div>
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Conexión establecida por: <span className="text-[#1E3A8A]">{rel.parent_attr?.name} = {rel.child_attr?.name}</span></p>
                     <p className="text-2xl font-black text-slate-900 italic tracking-tight">
                       {res.parentEntityName} <span className="text-slate-300 mx-3 font-normal">↔</span> {res.childEntityName}
                     </p>
                   </div>
                </div>
                <div className="flex items-center gap-4">
                  {auditProgress[`${rel.id}-parent`] || auditProgress[`${rel.id}-child`] ? (
                    <div className="flex items-center gap-2 text-[10px] font-black text-[#1E3A8A] animate-pulse">
                      <Database size={12} />
                      {auditProgress[`${rel.id}-parent`] || auditProgress[`${rel.id}-child`]}
                    </div>
                  ) : null}
                  {res.isLoading && <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest"><Loader2 className="animate-spin" size={16} /> Analizando...</div>}
                </div>
              </div>

              {/* Grid de Auditoría Bidireccional */}
              <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-slate-100">
                {/* Lado A → B */}
                <div className="p-10 space-y-8 bg-white">
                  <div className="flex justify-between items-center">
                    <h5 className="text-[12px] font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2">
                       <span className="text-[#1E3A8A] truncate max-w-[120px]">{res.parentEntityName}</span>
                       <ArrowRight size={14} className="text-slate-300" />
                       <span className="text-slate-400 truncate max-w-[120px]">{res.childEntityName}</span>
                    </h5>
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${pIntegrity > 95 ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                      {Math.round(pIntegrity)}% Integridad
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-1">
                      <p className="text-4xl font-black text-blue-700 italic tracking-tighter">{pMatches}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Coincidencias (Matches)</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <p className={`text-4xl font-black italic tracking-tighter ${pOrphans > 0 ? 'text-red-500' : 'text-slate-200'}`}>{pOrphans}</p>
                        {pOrphans > 0 && (
                          <button 
                            onClick={() => setSelectedOrphanView({ relId: rel.id, direction: 'parent', orphans: res.parentOrphans, entityName: res.parentEntityName })}
                            className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all border border-red-100 shadow-sm"
                            title="Ver Huérfanos"
                          >
                            <AlertCircle size={18} />
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest truncate">Inconsistencias (Huérfanos)</p>
                    </div>
                  </div>
                </div>

                {/* Lado B → A */}
                <div className="p-10 space-y-8 bg-slate-50/30">
                  <div className="flex justify-between items-center">
                    <h5 className="text-[12px] font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2">
                       <span className="text-[#1E3A8A] truncate max-w-[120px]">{res.childEntityName}</span>
                       <ArrowRight size={14} className="text-slate-300" />
                       <span className="text-slate-400 truncate max-w-[120px]">{res.parentEntityName}</span>
                    </h5>
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${cIntegrity > 95 ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                      {Math.round(cIntegrity)}% Integridad
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-1">
                      <p className="text-4xl font-black text-blue-700 italic tracking-tighter">{cMatches}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Coincidencias (Matches)</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <p className={`text-4xl font-black italic tracking-tighter ${cOrphans > 0 ? 'text-red-500' : 'text-slate-200'}`}>{cOrphans}</p>
                        {cOrphans > 0 && (
                          <button 
                            onClick={() => setSelectedOrphanView({ relId: rel.id, direction: 'child', orphans: res.childOrphans, entityName: res.childEntityName })}
                            className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all border border-red-100 shadow-sm"
                            title="Ver Huérfanos"
                          >
                            <AlertCircle size={18} />
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest truncate">Inconsistencias (Huérfanos)</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Modal Detalle de Huérfanos: Fila Completa + Eliminación ── */}
      {selectedOrphanView && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-[98vw] h-full max-h-[96vh] rounded-[3.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-500 border border-white/20">
             {/* Header Modal */}
             <div className="p-8 border-b border-slate-100 flex items-center justify-between shrink-0">
               <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-600">
                   <AlertCircle size={24} />
                 </div>
                 <div>
                   <h4 className="text-2xl font-black text-slate-900 italic leading-tight">Huérfanos en {selectedOrphanView.entityName}</h4>
                   <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Estos registros no tienen correspondencia en la tabla vinculada.</p>
                 </div>
               </div>
               <div className="flex items-center gap-3">
                  <div className="flex items-center bg-slate-50 p-1.5 rounded-2xl border border-slate-100 mr-2">
                    <button 
                      onClick={() => setHiddenColumns(new Set())}
                      className="px-3 py-1.5 text-[9px] font-black uppercase text-slate-400 hover:text-slate-900 transition-colors"
                    >
                      Mostrar Todo
                    </button>
                    <div className="w-[1px] h-4 bg-slate-200 mx-1" />
                    <div className="flex gap-1 max-w-[400px] overflow-x-auto no-scrollbar px-2">
                      {allAvailableColumns.map(col => (
                        <button
                          key={col}
                          onClick={() => {
                            const next = new Set(hiddenColumns);
                            if (next.has(col)) next.delete(col);
                            else next.add(col);
                            setHiddenColumns(next);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase whitespace-nowrap transition-all border ${
                            !hiddenColumns.has(col) 
                              ? 'bg-[#1E3A8A]/10 text-[#1E3A8A] border-[#1E3A8A]/20' 
                              : 'bg-white text-slate-300 border-slate-100 hover:border-slate-200'
                          }`}
                        >
                          {col}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedRecords.size > 0 && (
                    <button 
                      onClick={handleBulkDelete}
                      disabled={isDeleting}
                      className="px-6 py-3 bg-red-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-700 transition-all flex items-center gap-2 shadow-lg shadow-red-200 disabled:opacity-50"
                    >
                      {isDeleting ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                      Eliminar {selectedRecords.size} Seleccionados
                    </button>
                  )}
                  <button onClick={() => { setSelectedOrphanView(null); setSelectedRecords(new Set()); setHiddenColumns(new Set()); }} className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:text-red-500 transition-all">
                    <X size={24} />
                  </button>
                </div>
              </div>

              {/* Disclaimer */}
              <div className="bg-amber-50 px-8 py-3 flex items-center justify-between text-amber-700 border-b border-amber-100">
                <div className="flex items-center gap-3">
                  <Info size={14} />
                  <p className="text-[10px] font-black uppercase tracking-widest">Tip: Haz Doble Clic en una celda para limpiar o corregir un valor.</p>
                </div>
                <p className="text-[9px] font-bold opacity-50 uppercase tracking-tighter">Control de Seguridad: Eliminación Irreversible</p>
              </div>

             {/* Contenido Tabla Contextual */}
             <div className="flex-1 overflow-auto p-8 bg-slate-50/30">
               {selectedOrphanView.orphans.length > 0 ? (
                 <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                   <table className="w-full text-left text-xs border-collapse">
                     <thead className="bg-slate-50 sticky top-0 z-10">
                       <tr>
                         <th className="px-6 py-4 w-10">
                           <button onClick={() => {
                             if (selectedRecords.size === selectedOrphanView.orphans.length) setSelectedRecords(new Set());
                             else setSelectedRecords(new Set(selectedOrphanView.orphans.map(r => r.__record_id)));
                           }} className="text-slate-300 hover:text-[#1E3A8A]">
                             {selectedRecords.size === selectedOrphanView.orphans.length ? <CheckSquare size={16} /> : <Square size={16} />}
                           </button>
                         </th>
                         {allAvailableColumns.filter(k => !hiddenColumns.has(k)).map(col => (
                           <th key={col} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap border-l border-slate-50/50">{col}</th>
                         ))}
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-50">
                        {selectedOrphanView.orphans.map((row) => (
                          <tr key={row.__record_id} className={`hover:bg-slate-50 transition-colors ${selectedRecords.has(row.__record_id) ? 'bg-red-50/10' : ''}`}>
                            <td className="px-6 py-4">
                               <button onClick={() => toggleRecordSelection(row.__record_id)} className={selectedRecords.has(row.__record_id) ? 'text-red-600' : 'text-slate-200 hover:text-red-300'}>
                                 {selectedRecords.has(row.__record_id) ? <CheckSquare size={16} /> : <Square size={16} />}
                               </button>
                            </td>
                            {allAvailableColumns.filter(k => !hiddenColumns.has(k)).map((col, idx) => (
                              <td 
                                key={idx} 
                                className="px-6 py-4 text-slate-600 border-l border-slate-50/50 relative group/cell"
                                onDoubleClick={() => setEditingCell({ recordId: row.__record_id, field: col, value: String(row[col] ?? '') })}
                              >
                                {editingCell?.recordId === row.__record_id && editingCell?.field === col ? (
                                  <div className="absolute inset-0 z-20 p-2 bg-white">
                                    <input 
                                      autoFocus
                                      value={editingCell.value}
                                      onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                                      onBlur={handleSaveCell}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveCell();
                                        if (e.key === 'Escape') setEditingCell(null);
                                      }}
                                      className="w-full h-full px-2 border-2 border-[#1E3A8A] rounded-lg text-xs font-bold focus:outline-none"
                                    />
                                  </div>
                                ) : (
                                  <div className="truncate max-w-[250px] font-medium" title={String(row[col])}>
                                    {String(row[col] ?? '—')}
                                  </div>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                     </tbody>
                   </table>
                 </div>
               ) : (
                 <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-700">
                      <Check size={40} />
                    </div>
                    <p className="text-[#1E3A8A] font-black italic text-xl">Sin huérfanos detectados</p>
                    <p className="text-slate-400 text-sm font-bold">¡Integridad total en esta dirección!</p>
                 </div>
               )}
             </div>
           </div>
        </div>
      )}
    </div>
  );
}
