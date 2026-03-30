'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Search, 
  Layers, 
  ChevronRight, 
  ChevronDown, 
  GripVertical, 
  Link as LinkIcon, 
  TrendingUp, 
  Clock, 
  CheckCircle2,
  Loader2,
  Info
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { buildWBSTree, compareWBS } from '@/lib/wbs-utils';
import { WBSNode } from '@/types/wbs';

interface CWPMatcherProps {
  programData: any[];
  cwpGroups: Record<string, Record<string, any>>;
  projectId?: string;
  onMappingsChange?: () => void;
}

export default function CWPMatcher({ programData, cwpGroups, projectId, onMappingsChange }: CWPMatcherProps) {
  const [wbsSearch, setWbsSearch] = useState('');
  const [cwpSearch, setCwpSearch] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [mappings, setMappings] = useState<Record<string, string>>({}); // edt -> cwp_name
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [draggedCWP, setDraggedCWP] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // 1. Construir Árbol WBS
  const treeResult = useMemo(() => {
    if (!programData || programData.length === 0) return null;
    return buildWBSTree(programData, 'edt');
  }, [programData]);

  // Map para saber qué CWP viene por defecto en el JSON
  const defaultCwps = useMemo(() => {
    const map: Record<string, string> = {};
    if (treeResult) {
      treeResult.flatTasks.forEach(n => {
        const cwp = n.metadata?.cwp || n.metadata?.CWP || '';
        if (cwp) map[n.id] = cwp;
      });
    }
    return map;
  }, [treeResult]);

  // Expandir primeros niveles por defecto
  useEffect(() => {
    if (treeResult && expandedNodes.size === 0) {
      const initial = new Set<string>();
      treeResult.flatTasks.forEach(n => { if (n.level <= 1) initial.add(n.id); });
      setExpandedNodes(initial);
    }
  }, [treeResult]);

  // 2. Cargar Mapeos existentes desde Supabase
  const loadMappings = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('wbs_cwp_mappings')
        .select('edt, cwp_name')
        .eq('project_id', projectId);
      
      if (!error && data) {
        const map: Record<string, string> = {};
        data.forEach(m => { map[m.edt] = m.cwp_name; });
        setMappings(map);
      }
    } catch (err) {
      console.error('Error loading mappings:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadMappings(); }, [loadMappings]);

  // 3. Lógica de Asignación y Propagación
  const assignCWP = useCallback(async (edt: string, cwpName: string | null) => {
    if (!projectId) return;
    
    // Obtener todos los descendientes para propagar
    const descendants: string[] = [];
    if (treeResult) {
      const findDescendants = (node: WBSNode) => {
        descendants.push(node.id);
        node.children.forEach(findDescendants);
      };
      const startNode = treeResult.flatTasks.find(n => n.id === edt);
      if (startNode) {
        findDescendants(startNode);
      }
    }

    const newMappings = { ...mappings };
    const toUpsert = [];
    const toDelete = [];

    for (const id of descendants) {
      const isRoot = id === edt; // nodo directamente clickeado — siempre asignar
      if (cwpName) {
        // No sobreescribir hijos que ya tienen un mapeo explícito en la BD
        if (!isRoot && mappings[id]) continue;
        newMappings[id] = cwpName;
        toUpsert.push({ project_id: projectId, edt: id, cwp_name: cwpName });
      } else {
        // Al borrar, solo limpiar el nodo raíz — los hijos conservan sus propios mapeos
        if (!isRoot) continue;
        delete newMappings[id];
        toDelete.push(id);
      }
    }

    setMappings(newMappings);
    setIsSaving(true);

    try {
      if (cwpName) {
        await supabase.from('wbs_cwp_mappings').upsert(toUpsert, { onConflict: 'project_id, edt' });
      } else if (toDelete.length > 0) {
        await supabase.from('wbs_cwp_mappings').delete().eq('project_id', projectId).in('edt', toDelete);
      }
      onMappingsChange?.();
    } catch (err) {
      console.error('Error saving mapping:', err);
    } finally {
      setIsSaving(false);
    }
  }, [projectId, treeResult, mappings, onMappingsChange]);

  // 4. Cálculos de HH (Resumen)
  const stats = useMemo(() => {
    if (!treeResult) return { total: 0, assigned: 0, pct: 0 };
    
    // Solo contar HH de hojas para el total de la base
    const leaves = treeResult.flatTasks.filter(n => n.children.length === 0);
    const total = leaves.reduce((s, n) => s + n.work, 0);
    const assigned = leaves.reduce((s, n) => s + ((mappings[n.id] || defaultCwps[n.id]) ? n.work : 0), 0);
    
    // Si el total es 0 (problema de carga), intentamos usar el nodo raíz '0'
    const rootTotal = treeResult.rootTasks.find(r => r.id === '0')?.work || total;

    return {
      total: rootTotal,
      assigned,
      pct: rootTotal > 0 ? (assigned / rootTotal) * 100 : 0
    };
  }, [treeResult, mappings, defaultCwps]);

  // 5. Filtrar CWPs
  const allCwps = useMemo(() => 
    Object.values(cwpGroups).flatMap(g => Object.values(g)),
    [cwpGroups]
  );
  
  const filteredCwps = useMemo(() => {
    if (!cwpSearch) return allCwps;
    const q = cwpSearch.toLowerCase();
    return allCwps.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.discipline?.toLowerCase().includes(q) ||
      c.displayName?.toLowerCase().includes(q)
    );
  }, [allCwps, cwpSearch]);

  // Lookup: código CWP → descripción (para mostrar en el badge del árbol WBS)
  const cwpDescMap = useMemo(() => {
    const map: Record<string, string> = {};
    allCwps.forEach(c => { if (c.displayName) map[c.name] = c.displayName; });
    return map;
  }, [allCwps]);

  // DnD Handlers
  const onDragStart = (e: React.DragEvent, cwpName: string) => {
    e.dataTransfer.setData('cwpName', cwpName);
    setDraggedCWP(cwpName);
  };

  const onDragOver = (e: React.DragEvent, edt: string) => {
    e.preventDefault();
    setDropTarget(edt);
  };

  const onDragLeave = () => {
    setDropTarget(null);
  };

  const onDrop = (e: React.DragEvent, edt: string) => {
    e.preventDefault();
    const cwpName = e.dataTransfer.getData('cwpName');
    if (cwpName) assignCWP(edt, cwpName);
    setDraggedCWP(null);
    setDropTarget(null);
  };

  if (!treeResult) return <div className="p-20 text-center text-slate-400">Cargando programa...</div>;

  return (
    <div className="flex flex-col h-full bg-brand-cloud/40 p-8 space-y-6 overflow-hidden">
      
      {/* ── Header Summary ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-[2.5rem] p-6 border border-brand-cloud shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">HH Totales Programa</p>
            <p className="text-3xl font-black text-brand-deep">
              {stats.total.toLocaleString('es-CL', { maximumFractionDigits: 0 })} h
            </p>
          </div>
          <div className="w-12 h-12 bg-brand-deep/5 rounded-2xl flex items-center justify-center text-brand-deep">
            <Clock size={24} />
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] p-6 border border-brand-cloud shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">HH Asignadas a CWP</p>
            <p className="text-3xl font-black text-brand-electric">
              {stats.assigned.toLocaleString('es-CL', { maximumFractionDigits: 0 })} h
            </p>
          </div>
          <div className="w-12 h-12 bg-brand-electric/5 rounded-2xl flex items-center justify-center text-brand-electric">
            <LinkIcon size={24} />
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] p-6 border border-brand-cloud shadow-sm overflow-hidden relative">
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cobertura de Asignación</p>
            <p className="text-3xl font-black text-slate-800">{stats.pct.toFixed(1)}%</p>
          </div>
          <div className="absolute bottom-0 left-0 h-1.5 bg-brand-electric transition-all duration-1000" style={{ width: `${stats.pct}%` }} />
          <TrendingUp className="absolute right-6 top-6 text-slate-100" size={48} />
        </div>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden">
        
        {/* ── COLUMNA IZQUIERDA: WBS ── */}
        <div className="flex-1 bg-white rounded-[3rem] border border-brand-cloud shadow-xl flex flex-col overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Layers className="text-brand-deep" size={20} />
              <h3 className="text-lg font-black italic text-slate-800 tracking-tight">Estructura WBS (Arrastra aquí)</h3>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
              <input 
                type="text" 
                placeholder="Filtrar WBS..." 
                value={wbsSearch}
                onChange={e => setWbsSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-brand-electric transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <div className="space-y-1">
              {treeResult.flatTasks.map(node => {
                const isExpanded = expandedNodes.has(node.id);
                const hasChildren = node.children.length > 0;
                
                // Prioridad: 1. Mapeo en BD (mappings), 2. Mapeo en JSON (defaultCwps)
                const assignedCWP = mappings[node.id] || defaultCwps[node.id];
                const isFromDB = !!mappings[node.id];
                const isOver = dropTarget === node.id;
                
                if (wbsSearch && !node.id.toLowerCase().includes(wbsSearch.toLowerCase()) && !node.name.toLowerCase().includes(wbsSearch.toLowerCase())) return null;

                return (
                  <div 
                    key={node.id}
                    onDragOver={e => onDragOver(e, node.id)}
                    onDragLeave={onDragLeave}
                    onDrop={e => onDrop(e, node.id)}
                    className={`group rounded-xl transition-all relative ${
                      isOver 
                        ? 'border-2 border-dashed border-green-500 bg-green-50/30' 
                        : assignedCWP 
                          ? 'bg-brand-electric/5 border border-brand-electric/20' 
                          : 'hover:bg-slate-50 border border-transparent'
                    } flex items-center px-4 py-2 gap-3 min-h-[44px]`}
                  >
                    <div style={{ width: node.level * 20 }} className="shrink-0" />
                    <button 
                      onClick={() => setExpandedNodes(prev => {
                        const next = new Set(prev);
                        if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
                        return next;
                      })}
                      className={`p-1 rounded-md ${hasChildren ? 'text-slate-400 hover:text-slate-900' : 'opacity-0 cursor-default'}`}
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black ${node.type === 'project' ? 'text-brand-deep' : 'text-slate-500'}`}>
                          {node.id}
                        </span>
                        {assignedCWP && (
                          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[8px] font-black shadow-lg max-w-[260px] ${
                            isFromDB ? 'bg-brand-deep text-white shadow-brand-deep/20' : 'bg-slate-200 text-slate-600'
                          }`}>
                            <CheckCircle2 size={8} className="shrink-0" />
                            <span className="uppercase tracking-widest shrink-0">{assignedCWP}</span>
                            {cwpDescMap[assignedCWP] && (
                              <span className={`truncate font-medium normal-case tracking-normal ${isFromDB ? 'text-white/60' : 'text-slate-400'}`}>
                                — {cwpDescMap[assignedCWP]}
                              </span>
                            )}
                            <button
                              onClick={() => assignCWP(node.id, null)}
                              className="ml-1 hover:text-brand-orange transition-colors shrink-0"
                            >
                              <X size={8} />
                            </button>
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] font-bold text-slate-700 truncate uppercase tracking-tight">
                        {node.name}
                      </span>
                    </div>

                    <div className="shrink-0 flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">HH</p>
                        <p className={`text-[10px] font-bold ${node.work > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                          {node.work.toLocaleString('es-CL', { maximumFractionDigits: 0 })} h
                        </p>
                      </div>
                      <div className="text-right w-12">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">%</p>
                        <p className="text-[10px] font-bold text-slate-600">{Math.round(node.progress)}%</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── COLUMNA DERECHA: CWPs ── */}
        <div className="w-96 bg-brand-deep rounded-[3rem] shadow-2xl flex flex-col overflow-hidden">
          <div className="p-8 border-b border-white/5 space-y-6">
            <h3 className="text-xl font-black italic text-white tracking-tight flex items-center gap-3">
              <GripVertical size={20} className="text-brand-electric" />
              Catálogo de CWPs
            </h3>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
              <input 
                type="text" 
                placeholder="Buscar CWP o disciplina..." 
                value={cwpSearch}
                onChange={e => setCwpSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-bold text-white outline-none focus:border-brand-electric transition-all"
              />
            </div>

            <div className="flex items-center gap-2 p-3 bg-brand-electric/10 border border-brand-electric/20 rounded-2xl">
              <Info size={14} className="text-brand-electric shrink-0" />
              <p className="text-[9px] font-bold text-brand-electric/80 leading-tight uppercase tracking-wide">
                Arrastra un CWP hacia una actividad WBS para asignarlo. Los hijos heredarán el CWP.
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
            {filteredCwps.map(cwp => (
              <div
                key={cwp.name}
                draggable
                onDragStart={e => onDragStart(e, cwp.name)}
                className="bg-white/5 hover:bg-white/10 border border-white/5 p-4 rounded-2xl cursor-grab active:cursor-grabbing transition-all group"
              >
                {/* Fila superior: disciplina + grip */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black text-brand-electric uppercase tracking-widest">{cwp.discipline || 'GENERAL'}</span>
                  <GripVertical size={12} className="text-white/20 group-hover:text-brand-electric transition-colors" />
                </div>

                {/* Código CWP — siempre visible y prominente */}
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-[11px] font-black text-brand-electric uppercase tracking-widest">{cwp.name}</span>
                </div>

                {/* Descripción */}
                <p className="text-sm font-black text-white italic leading-tight line-clamp-2">
                  {cwp.displayName || <span className="text-white/30 font-medium not-italic text-xs">Sin descripción</span>}
                </p>

                <div className="mt-3 flex items-center gap-3 pt-3 border-t border-white/5">
                  <div className="flex-1">
                    <p className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none mb-1">HH Estimadas</p>
                    <p className="text-xs font-black text-white">{Number(cwp.hh || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })} h</p>
                  </div>
                  <div className="flex-1 text-right">
                    <p className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none mb-1">Actividades</p>
                    <p className="text-xs font-black text-white">{cwp.activities || 0}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-6 bg-black/20 border-t border-white/5 flex items-center justify-between">
            <span className="text-[9px] font-black text-white/40 uppercase tracking-widest italic">
              {filteredCwps.length} CWPs disponibles
            </span>
            {isSaving && (
              <div className="flex items-center gap-2 text-brand-electric">
                <Loader2 size={12} className="animate-spin" />
                <span className="text-[9px] font-black uppercase">Sincronizando...</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

const X = ({ size, className = '' }: { size: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="3" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);
