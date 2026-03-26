'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Gantt, 
  Task, 
  EventOption, 
  ViewMode, 
  DisplayOption 
} from 'gantt-task-react';
import "gantt-task-react/dist/index.css";
import { 
  ChevronRight, 
  ChevronDown, 
  Filter, 
  Search, 
  Calendar, 
  Activity, 
  Layers,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { buildWBSTree, compareWBS } from '@/lib/wbs-utils';
import { WBSNode } from '@/types/wbs';

interface WBSTreeViewProps {
  data: any[];
  edtKey: string;
}

export default function WBSTreeView({ data, edtKey }: WBSTreeViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Month);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // 1. Construir el árbol WBS
  const treeResult = useMemo(() => {
    if (!data || data.length === 0) return null;
    return buildWBSTree(data, edtKey);
  }, [data, edtKey]);

  // Inicializar nodos expandidos (por defecto los primeros niveles)
  useEffect(() => {
    if (treeResult && expandedNodes.size === 0) {
      const initialExpanded = new Set<string>();
      treeResult.flatTasks.forEach(node => {
        if (node.level <= 1) initialExpanded.add(node.id);
      });
      setExpandedNodes(initialExpanded);
    }
  }, [treeResult]);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 2. Filtrar y procesar tareas para la visualización
  const processedTasks = useMemo(() => {
    if (!treeResult) return [];

    const visibleNodes: WBSNode[] = [];
    const checkVisibility = (node: WBSNode, isParentExpanded: boolean) => {
      if (!isParentExpanded) return;
      
      const matchesSearch = !searchTerm || 
        node.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        node.id.toLowerCase().includes(searchTerm.toLowerCase());

      if (matchesSearch || node.children.some(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))) {
        visibleNodes.push(node);
        const isCurrentExpanded = expandedNodes.has(node.id);
        node.children.forEach(child => checkVisibility(child, isCurrentExpanded));
      }
    };

    treeResult.rootTasks.forEach(root => checkVisibility(root, true));

    // Convertir a formato Task de gantt-task-react
    return visibleNodes.map(node => ({
      id: node.id,
      name: node.name,
      start: node.start,
      end: node.end,
      progress: node.progress,
      type: node.type as any, // 'project' or 'task'
      project: node.parentId || undefined,
      displayOrder: visibleNodes.indexOf(node) + 1,
      styles: {
        backgroundColor: node.type === 'project' ? '#7CB342' : '#AED581',
        backgroundSelectedColor: '#689f38',
        progressColor: '#33691E',
        progressSelectedColor: '#1B5E20',
      }
    } as Task));
  }, [treeResult, expandedNodes, searchTerm]);

  if (!treeResult || treeResult.flatTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 p-20 border-2 border-dashed border-slate-200 rounded-[3rem]">
        <Layers size={48} className="mb-4 opacity-20" />
        <p className="font-bold italic">No se detectaron datos jerárquicos. Asegúrate de que el campo EDT esté configurado correctamente.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
      {/* ── Header de Configuración ── */}
      <div className="p-6 border-b border-slate-50 flex flex-wrap items-center justify-between gap-4 bg-slate-50/30">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
            <input 
              type="text"
              placeholder="Buscar en WBS..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:border-[#7CB342] outline-none transition-all w-64 shadow-sm"
            />
          </div>
          <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            {(['Hour', 'Day', 'Week', 'Month'] as ViewMode[]).map(mode => (
              <button 
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  viewMode === mode ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {mode === 'Hour' ? 'Hora' : mode === 'Day' ? 'Día' : mode === 'Week' ? 'Sem' : 'Mes'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-[#7CB342]" />
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{treeResult.flatTasks.length} Nodos WBS</span>
          </div>
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-slate-400" />
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Nivel Máx: {treeResult.maxLevel}</span>
          </div>
        </div>
      </div>

      {/* ── Área Principal: Tabla Jerárquica + Gantt ── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Usamos un contenedor relativo para manejar el scroll sincronizado opcionalmente, 
            aunque gantt-task-react maneja su propia tabla. 
            Para una experiencia "Premium", personalizaremos la tabla del Gantt. */}
        <div className="flex-1 overflow-auto gantt-container-custom">
          {processedTasks.length > 0 ? (
            <Gantt
              tasks={processedTasks}
              viewMode={viewMode}
              onDateChange={(task) => console.log('Date changed', task)}
              onProgressChange={(task) => console.log('Progress changed', task)}
              onDoubleClick={(task) => setSelectedTaskId(task.id)}
              onSelect={(task, isSelected) => isSelected ? setSelectedTaskId(task.id) : setSelectedTaskId(null)}
              locale="es"
              listCellWidth="280px"
              columnWidth={viewMode === ViewMode.Month ? 150 : 60}
              headerHeight={60}
              rowHeight={45}
              barCornerRadius={8}
              handleWidth={8}
              projectBackgroundColor="#7CB342"
              projectBackgroundSelectedColor="#689f38"
              fontSize="11px"
              fontFamily="inherit"
              TaskListHeader={({ headerHeight }) => (
                <div 
                  className="bg-slate-900 text-white flex items-center px-4 font-black text-[10px] uppercase tracking-[0.2em]"
                  style={{ height: headerHeight }}
                >
                  Estructura WBS / Tarea
                </div>
              )}
              TaskListTable={({ rowHeight, tasks, selectedTaskId, setSelectedTask, locale }) => (
                <div className="bg-white border-r border-slate-100">
                  {tasks.map(t => {
                    const node = treeResult.flatTasks.find(n => n.id === t.id);
                    if (!node) return null;
                    const isExpanded = expandedNodes.has(t.id);
                    const hasChildren = node.children.length > 0;
                    
                    return (
                      <div 
                        key={t.id}
                        className={`flex items-center px-2 cursor-pointer transition-colors border-b border-slate-50 ${
                          selectedTaskId === t.id ? 'bg-[#7CB342]/10' : 'hover:bg-slate-50'
                        }`}
                        style={{ height: rowHeight }}
                        onClick={() => setSelectedTask(t.id)}
                      >
                        <div style={{ width: node.level * 16 }} className="shrink-0" />
                        <button 
                          onClick={(e) => toggleExpand(t.id, e)}
                          className={`p-1 mr-1 rounded-md transition-all ${hasChildren ? 'text-slate-400 hover:text-slate-900' : 'opacity-0 cursor-default'}`}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        <div className="flex flex-col min-w-0">
                          <span className={`text-[11px] font-black truncate ${node.type === 'project' ? 'text-slate-900' : 'text-slate-600'}`}>
                            {node.id}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400 truncate uppercase tracking-tight">
                            {node.name}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-300 italic font-bold">
              No hay tareas visibles con los filtros actuales.
            </div>
          )}
        </div>
      </div>

      {/* ── Footer: Detalle de Tarea Seleccionada ── */}
      {selectedTaskId && (
        <div className="shrink-0 h-48 bg-white border-t border-slate-200 p-8 animate-in slide-in-from-bottom duration-300 shadow-2xl z-20 overflow-y-auto">
          {(() => {
            const node = treeResult.flatTasks.find(n => n.id === selectedTaskId);
            if (!node) return null;
            return (
              <div className="max-w-7xl mx-auto flex gap-12">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-emerald-50 text-[#7CB342] text-[10px] font-black rounded-full border border-emerald-100 uppercase tracking-widest">
                      {node.type === 'project' ? 'Resumen WBS' : 'Actividad'}
                    </span>
                    <h4 className="text-2xl font-black text-slate-900 italic tracking-tight">{node.id} — {node.name}</h4>
                  </div>
                  <div className="grid grid-cols-4 gap-6">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-3">
                      <Clock className="text-slate-300" size={20} />
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Esfuerzo (HH)</p>
                        <p className="text-lg font-black text-slate-700">{node.work.toLocaleString()} hrs</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-3">
                      <CheckCircle2 className="text-[#7CB342]" size={20} />
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Progreso</p>
                        <p className="text-lg font-black text-slate-700">{Math.round(node.progress)}%</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-3">
                      <Calendar className="text-blue-300" size={20} />
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Comienzo</p>
                        <p className="text-lg font-black text-slate-700">{node.start.toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-3">
                      <AlertCircle className="text-rose-300" size={20} />
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Término</p>
                        <p className="text-lg font-black text-slate-700">{node.end.toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="w-64 border-l border-slate-100 pl-8 space-y-4">
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Metadatos Extendidos</p>
                  <div className="space-y-2 max-h-24 overflow-y-auto pr-2 no-scrollbar">
                    {Object.entries(node.metadata).slice(0, 10).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-[11px] font-bold">
                        <span className="text-slate-400">{k}:</span>
                        <span className="text-slate-600 truncate ml-2">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
