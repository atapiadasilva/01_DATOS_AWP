'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Filter, Tag, BarChart3, Clock, Target, 
  Layers, Package, Database, Camera, FileText, 
  ChevronRight, Layout, Loader2, ExternalLink,
  ArrowUpRight, TrendingUp, Activity, CheckCircle2,
  Plus, X, Unlink
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSourceOfTruth } from '@/hooks/useSourceOfTruth';
import EmbeddedView from '@/components/views/EmbeddedView';
import CWPPhotoGallery from '@/components/cwp/CWPPhotoGallery';
import CWPReportEditor from '@/components/cwp/CWPReportEditor';

interface CwpDashboardProps {
  projectId: string;
  entities: any[];
  customViews: any[];
}

export default function CwpDashboard({ projectId, entities, customViews }: CwpDashboardProps) {
  const { mappings } = useSourceOfTruth(projectId);
  
  // ─── Estado de Datos ───
  const [cwpGroups, setCwpGroups] = useState<Record<string, any>>({});
  const [selectedCWP, setSelectedCWP] = useState<any | null>(null);
  const [cwpSearch, setCwpSearch] = useState('');
  const [filterDiscipline, setFilterDiscipline] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // ─── Estado de Navegación Interior ───
  const [activeTab, setActiveTab] = useState<'programa' | 'evidencia' | 'reporte'>('programa');
  const [showReportEditor, setShowReportEditor] = useState(false);

  // ─── Datos del Programa y HH ───
  const [ganttTasks, setGanttTasks] = useState<any[]>([]);
  const [wbsMappings, setWbsMappings] = useState<Record<string, string>>({});
  const [linkedViewIds, setLinkedViewIds] = useState<string[]>([]);
  const [isLinking, setIsLinking] = useState(false);
  const [showLinkSelector, setShowLinkSelector] = useState(false);

  // 1. Cargar Mapeos WBS-CWP y Tareas desde API dinámica
  useEffect(() => {
    const loadProgramData = async () => {
      try {
        // Cargar mapeos y tareas en paralelo
        const [mappingsRes, wbsRes] = await Promise.all([
          supabase
            .from('wbs_cwp_mappings')
            .select('edt, cwp_name')
            .eq('project_id', projectId),
          fetch(`/api/aps/wbs?projectId=${projectId}`).then(r => {
            if (!r.ok) throw new Error(`WBS API error: ${r.status}`);
            return r.json();
          }),
        ]);

        // Construir mapa de mapeos primero
        const m: Record<string, string> = {};
        (mappingsRes.data ?? []).forEach((r: any) => { m[r.edt] = r.cwp_name; });
        setWbsMappings(m);

        // Mapear tareas usando los mapeos recién cargados (no el estado stale)
        const rawTasks: any[] = wbsRes.tasks ?? [];
        setGanttTasks(rawTasks.map((d: any) => ({
          edt:        String(d.edt ?? ''),
          name:       String(d.name ?? ''),
          hh:         parseFloat(d.hh) || 0,
          pct:        parseFloat(d.progress ?? d.pct) || 0,
          cwp:        m[String(d.edt)] || d.cwp || '',
          start:      d.start ?? '',
          end:        d.end ?? '',
          discipline: d.discipline ?? '',
          level:      d.level ?? 0,
          hasChildren: d.hasChildren ?? false,
        })));
      } catch (e) {
        console.error('Error loading program data:', e);
      }
    };
    loadProgramData();
  }, [projectId]);

  // Actualizar CWP en tareas cuando los mapeos carguen
  const resolvedTasks = useMemo(() => 
    ganttTasks.map(t => ({
      ...t,
      cwp: wbsMappings[String(t.edt)] || t.cwp || ''
    })), 
    [ganttTasks, wbsMappings]
  );

  // Mapa de HH por CWP
  const cwpHHMap = useMemo(() => {
    const map: Record<string, { totalHH: number; doneHH: number; pct: number; tasks: any[] }> = {};
    const withCwp = resolvedTasks.filter(t => t.cwp?.trim());
    const codes = Array.from(new Set(withCwp.map(t => t.cwp.trim())));
    
    codes.forEach(cwp => {
      const group = withCwp.filter(t => t.cwp.trim() === cwp);
      // Solo hojas para evitar doble conteo
      const leaves = group.filter(t => !group.some(o => o.edt.startsWith(t.edt + '.')));
      const totalHH = leaves.reduce((s, t) => s + t.hh, 0);
      const doneHH  = leaves.reduce((s, t) => s + t.hh * t.pct / 100, 0);
      map[cwp] = { 
        totalHH, 
        doneHH, 
        pct: totalHH > 0 ? (doneHH / totalHH) * 100 : 0, 
        tasks: leaves 
      };
    });
    return map;
  }, [resolvedTasks]);

  // 2. Cargar Catálogo Maestro CWP
  useEffect(() => {
    const loadCwpMaster = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('cwp_master')
          .select('*')
          .eq('project_id', projectId)
          .eq('is_active', true);

        if (!error && data) {
          const groups: Record<string, any[]> = {};
          data.forEach(r => {
            const disc = r.discipline?.toUpperCase() || 'GENERAL';
            if (!groups[disc]) groups[disc] = [];
            
            // Vincular con HH
            const hhInfo = cwpHHMap[r.cwp_code] || Object.entries(cwpHHMap).find(([k]) => 
              k.toLowerCase().includes(r.cwp_code.toLowerCase()) || r.cwp_code.toLowerCase().includes(k.toLowerCase())
            )?.[1];

            groups[disc].push({
              id: r.id,
              name: r.cwp_code,
              displayName: r.cwp_description,
              discipline: disc,
              area: r.area,
              tags: r.tags,
              hhData: hhInfo || null,
              progress: hhInfo?.pct || 0
            });
          });
          setCwpGroups(groups);
        }
      } catch (e) {
        console.error('Error loading CWP master:', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadCwpMaster();
  }, [projectId, cwpHHMap]);
  
  // 3. Cargar Vistas Vinculadas (Persistentes)
  useEffect(() => {
    if (!projectId || !selectedCWP) return;
    const loadLinks = async () => {
      console.log('Cargando links para CWP:', selectedCWP.name);
      const { data, error } = await supabase
        .from('cwp_view_links')
        .select('view_id')
        .eq('project_id', projectId)
        .eq('cwp_code', selectedCWP.name);
      
      if (error) {
        console.error('Error cargando links:', error);
      } else if (data) {
        console.log('Links cargados:', data);
        setLinkedViewIds(data.map(d => d.view_id));
      }
    };
    loadLinks();
  }, [projectId, selectedCWP]);

  const handleLinkView = async (viewId: string) => {
    if (!selectedCWP || !projectId) {
      console.error('Falta selectedCWP o projectId', { selectedCWP, projectId });
      return;
    }
    setIsLinking(true);
    try {
      console.log('Intentando vincular vista:', viewId, 'al CWP:', selectedCWP.name);
      const { error } = await supabase
        .from('cwp_view_links')
        .insert({
          project_id: projectId,
          cwp_code: selectedCWP.name,
          view_id: viewId
        });
      
      if (!error) {
        console.log('Vista vinculada con éxito');
        setLinkedViewIds(prev => [...prev, viewId]);
        setShowLinkSelector(false);
      } else {
        console.error('Error de Supabase al vincular:', error);
        alert(`Error al vincular vista: ${error.message}`);
      }
    } catch (e: any) {
      console.error('Excepción al vincular view:', e);
      alert(`Error crítico: ${e.message}`);
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkView = async (viewId: string) => {
    if (!selectedCWP || !projectId) return;
    try {
      const { error } = await supabase
        .from('cwp_view_links')
        .delete()
        .eq('project_id', projectId)
        .eq('cwp_code', selectedCWP.name)
        .eq('view_id', viewId);
      
      if (!error) {
        setLinkedViewIds(prev => prev.filter(id => id !== viewId));
      }
    } catch (e) {
      console.error('Error unlinking view:', e);
    }
  };

  // ─── Filtrado ───
  const filteredDisciplines = useMemo(() => {
    let keys = Object.keys(cwpGroups).sort();
    if (filterDiscipline) keys = keys.filter(k => k === filterDiscipline);
    return keys;
  }, [cwpGroups, filterDiscipline]);

  const filteredCwpsBySearch = (cwps: any[]) => {
    if (!cwpSearch) return cwps;
    const q = cwpSearch.toLowerCase();
    return cwps.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.displayName?.toLowerCase().includes(q) ||
      c.area?.toLowerCase().includes(q)
    );
  };

  // Vistas automáticas y manuales para el CWP seleccionado
  const activeCwpViews = useMemo(() => {
    if (!selectedCWP) return [];
    
    // 1. Vistas auto-detectadas (tienen CWP/WBS en columnas o filter_key)
    const autoViews = customViews.filter(v => 
      v.filter_key || 
      (v.columns && v.columns.some((c: string) => ['CWP', 'PACKAGE', 'WBS'].includes(c.toUpperCase())))
    );

    // 2. Vistas vinculadas manualmente
    const manualViews = customViews.filter(v => linkedViewIds.includes(v.id));

    // Consolidar (evitando duplicados)
    const all = [...autoViews];
    manualViews.forEach(mv => {
      if (!all.some(a => a.id === mv.id)) all.push(mv);
    });

    return all;
  }, [selectedCWP, customViews, linkedViewIds]);

  // ─── Render ───
  return (
    <div className="flex h-full bg-[#f8fafc] overflow-hidden">
      
      {/* ── Sidebar: Listado de CWPs ── */}
      <div className="w-80 shrink-0 bg-white border-r border-slate-200 flex flex-col shadow-sm">
        <div className="p-6 border-b border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight italic">Paquetes de Trabajo</h3>
            <div className="p-1 px-2 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-500">
              {Object.values(cwpGroups).flat().length} Total
            </div>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
            <input 
              type="text" 
              placeholder="Buscar CWP o área..." 
              value={cwpSearch}
              onChange={e => setCwpSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-brand-electric transition-all"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button 
              onClick={() => setFilterDiscipline('')}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase whitespace-nowrap transition-all ${!filterDiscipline ? 'bg-brand-deep text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
            >
              Cualquiera
            </button>
            {Object.keys(cwpGroups).sort().map(d => (
              <button 
                key={d}
                onClick={() => setFilterDiscipline(filterDiscipline === d ? '' : d)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase whitespace-nowrap transition-all ${filterDiscipline === d ? 'bg-brand-deep text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="animate-spin text-brand-electric" size={20} />
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Cargando catálogo...</p>
            </div>
          ) : filteredDisciplines.map(disc => {
            const cwps = filteredCwpsBySearch(cwpGroups[disc]);
            if (cwps.length === 0) return null;

            return (
              <div key={disc} className="space-y-2">
                <div className="flex items-center gap-2 px-2">
                  <Layers size={10} className="text-slate-300" />
                  <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{disc}</span>
                </div>
                <div className="space-y-1">
                  {cwps.map(cwp => (
                    <button
                      key={cwp.id}
                      onClick={() => setSelectedCWP(cwp)}
                      className={`w-full group text-left p-3 rounded-2xl transition-all border ${
                        selectedCWP?.id === cwp.id 
                          ? 'bg-brand-deep border-brand-deep shadow-lg shadow-brand-deep/20' 
                          : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-100'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1.5">
                        <span className={`text-[11px] font-black uppercase tracking-tight ${selectedCWP?.id === cwp.id ? 'text-white' : 'text-slate-900'}`}>
                          {cwp.name}
                        </span>
                        {cwp.progress > 0 && (
                          <span className={`text-[9px] font-black ${selectedCWP?.id === cwp.id ? 'text-brand-electric' : 'text-brand-deep'}`}>
                            {cwp.progress.toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <p className={`text-[9px] font-bold line-clamp-1 ${selectedCWP?.id === cwp.id ? 'text-white/60' : 'text-slate-400'}`}>
                        {cwp.displayName || 'Sin descripción'}
                      </p>
                      {cwp.area && (
                        <div className="flex items-center gap-1 mt-2">
                          <Target size={8} className={selectedCWP?.id === cwp.id ? 'text-white/40' : 'text-slate-300'} />
                          <span className={`text-[8px] font-black uppercase tracking-wider ${selectedCWP?.id === cwp.id ? 'text-white/40' : 'text-slate-300'}`}>
                            {cwp.area}
                          </span>
                        </div>
                      )}
                      
                      {/* Progress bar mini */}
                      {cwp.progress > 0 && (
                        <div className={`h-1 w-full rounded-full mt-2.5 overflow-hidden ${selectedCWP?.id === cwp.id ? 'bg-white/10' : 'bg-slate-100'}`}>
                          <div 
                            className={`h-full rounded-full ${selectedCWP?.id === cwp.id ? 'bg-brand-electric' : 'bg-brand-deep'}`} 
                            style={{ width: `${cwp.progress}%` }} 
                          />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Área de Detalle ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedCWP ? (
          <>
            <div className="shrink-0 bg-white border-b border-slate-200 p-8 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-black italic text-slate-900 tracking-tight">{selectedCWP.name}</h2>
                  <span className="px-3 py-1 bg-brand-deep/5 text-brand-deep text-[9px] font-black uppercase rounded-full border border-brand-deep/10">
                    {selectedCWP.discipline}
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-400 max-w-xl">{selectedCWP.displayName || 'Este paquete de trabajo no tiene una descripción detallada en el catálogo maestro.'}</p>
              </div>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setShowReportEditor(true)}
                  className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10"
                >
                  <FileText size={14} /> Reporte Ejecutivo
                </button>
                <div className="h-10 w-px bg-slate-100 mx-2" />
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none">Última Sincronización</p>
                  <p className="text-[10px] font-bold text-slate-500 mt-1">Hoy, 10:45 AM</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
              
              {/* KPIs de Alto Nivel */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'HH Totales', value: selectedCWP.hhData?.totalHH?.toLocaleString() || '0', sub: 'Horas Hombre Directas', icon: Clock, color: 'text-brand-deep', bg: 'bg-brand-deep/5' },
                  { label: 'Avance Real', value: `${selectedCWP.progress.toFixed(1)}%`, sub: 'Físico acumulado', icon: TrendingUp, color: 'text-brand-electric', bg: 'bg-brand-electric/5' },
                  { label: 'Actividades', value: selectedCWP.hhData?.tasks?.length || '0', sub: 'Vinculadas en WBS', icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-50' },
                  { label: 'Área / Sector', value: selectedCWP.area || 'N/A', sub: 'Ubicación física', icon: Target, color: 'text-rose-500', bg: 'bg-rose-50' },
                ].map((kpi, i) => (
                  <div key={i} className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{kpi.label}</p>
                        <h4 className={`text-2xl font-black ${kpi.color} tracking-tight`}>{kpi.value}</h4>
                      </div>
                      <div className={`p-3 ${kpi.bg} rounded-2xl ${kpi.color}`}>
                        <kpi.icon size={20} />
                      </div>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 mt-4 flex items-center gap-1.5 opacity-60">
                      {kpi.sub} <ArrowUpRight size={10} />
                    </p>
                    <div className={`absolute bottom-0 left-0 h-1 bg-current opacity-20 ${kpi.color}`} style={{ width: '100%' }} />
                  </div>
                ))}
              </div>

              {/* Contenido Principal (Tabs) */}
              <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                <div className="px-8 border-b border-slate-50 flex items-center justify-between shrink-0 h-16">
                  <div className="flex gap-8 h-full">
                    {[
                      { id: 'programa', label: 'Programa de Obra', icon: BarChart3 },
                      { id: 'evidencia', label: 'Evidencias 360°', icon: Camera },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`h-full px-2 flex items-center gap-2.5 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
                          activeTab === tab.id ? 'border-brand-electric text-brand-deep' : 'border-transparent text-slate-300 hover:text-slate-500'
                        }`}
                      >
                        <tab.icon size={14} />
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-8">
                  {activeTab === 'programa' && (
                    <div className="space-y-8">
                      {/* Tabla de Actividades del CWP */}
                      <div>
                        <div className="flex items-center justify-between mb-4 px-2">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Activity size={12} className="text-brand-electric" /> Detalle de Actividades WBS
                          </h4>
                          <span className="text-[10px] font-bold text-slate-300 italic">{selectedCWP.hhData?.tasks?.length || 0} tareas en total</span>
                        </div>
                        <div className="overflow-hidden rounded-2xl border border-slate-50 shadow-inner bg-slate-50/30">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-100/50">
                                <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">EDT</th>
                                <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Descripción</th>
                                <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">HH</th>
                                <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Progreso</th>
                                <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {selectedCWP.hhData?.tasks?.map((t: any) => (
                                <tr key={t.edt} className="hover:bg-white transition-all group">
                                  <td className="px-5 py-3 text-[10px] font-black text-brand-deep/40">{t.edt}</td>
                                  <td className="px-5 py-3 text-[11px] font-bold text-slate-700">{t.name}</td>
                                  <td className="px-5 py-3 text-[11px] font-black text-brand-deep text-right">{t.hh.toLocaleString()} h</td>
                                  <td className="px-5 py-3">
                                    <div className="flex items-center gap-3">
                                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all duration-1000 ${t.pct === 100 ? 'bg-brand-deep' : 'bg-brand-electric'}`} style={{ width: `${t.pct}%` }} />
                                      </div>
                                      <span className="text-[10px] font-black text-slate-400 w-8">{t.pct}%</span>
                                    </div>
                                  </td>
                                  <td className="px-5 py-3 text-center">
                                    {t.pct === 100 ? (
                                      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[8px] font-black uppercase">
                                        <CheckCircle2 size={10} /> Finalizado
                                      </div>
                                    ) : (
                                      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[8px] font-black uppercase">
                                        En Ejecución
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                              {!selectedCWP.hhData?.tasks?.length && (
                                <tr>
                                  <td colSpan={5} className="py-20 text-center text-slate-300 text-sm font-bold italic">No hay actividades vinculadas a este CWP en el programa maestro.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Vistas Secundarias (Materiales, Planos, etc) */}
                      <div className="space-y-6 pt-4">
                        <div className="flex items-center justify-between mb-4 px-2">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Database size={12} className="text-brand-electric" /> Datos Relacionados (Vistas Vinculadas)
                          </h4>
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => setShowLinkSelector(!showLinkSelector)}
                              className="px-3 py-1.5 bg-brand-deep/5 text-brand-deep rounded-lg text-[9px] font-black uppercase flex items-center gap-1.5 hover:bg-brand-deep/10 transition-all"
                            >
                              <Plus size={10} /> Vincular Vista
                            </button>
                            <div className="text-[10px] font-bold text-slate-300 italic">{activeCwpViews.length} vistas</div>
                          </div>
                        </div>

                        {showLinkSelector && (
                          <div className="mb-6 mx-2 p-5 bg-slate-50 rounded-2xl border border-slate-100 animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center justify-between mb-4">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Seleccionar vista para vincular</p>
                              <button onClick={() => setShowLinkSelector(false)}><X size={14} className="text-slate-300 hover:text-slate-500" /></button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {customViews
                                .filter(v => !activeCwpViews.some(av => av.id === v.id))
                                .map(v => (
                                  <button
                                    key={v.id}
                                    onClick={() => handleLinkView(v.id)}
                                    className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-brand-electric group transition-all"
                                  >
                                    <div className="text-left">
                                      <p className="text-[10px] font-black text-slate-700 group-hover:text-brand-electric transition-colors">{v.name}</p>
                                      <p className="text-[8px] font-bold text-slate-400 uppercase leading-none mt-1">
                                        {entities.find(e => e.id === v.entity_id)?.name || 'Tabla base'}
                                      </p>
                                    </div>
                                    <Plus size={12} className="text-slate-300 group-hover:text-brand-electric" />
                                  </button>
                                ))
                              }
                              {customViews.filter(v => !activeCwpViews.some(av => av.id === v.id)).length === 0 && (
                                <p className="col-span-full py-4 text-center text-[10px] font-bold text-slate-300 italic">No hay más vistas disponibles para vincular.</p>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-8">
                          {activeCwpViews.map(view => (
                            <div key={view.id} className="relative group/v border border-slate-50 rounded-[2.5rem] p-4 hover:border-brand-electric/20 transition-all">
                              {linkedViewIds.includes(view.id) && (
                                <button 
                                  onClick={() => handleUnlinkView(view.id)}
                                  className="absolute top-6 right-8 p-1.5 bg-red-50 text-red-400 rounded-lg opacity-0 group-hover/v:opacity-100 transition-opacity hover:bg-red-100"
                                  title="Desvincular vista"
                                >
                                  <Unlink size={12} />
                                </button>
                              )}
                              <EmbeddedView 
                                viewName={view.id} 
                                title={view.name}
                                filterValue={selectedCWP.name} 
                                customViews={customViews} 
                                entities={entities}
                                mappings={mappings}
                                isCompact={false}
                              />
                            </div>
                          ))}
                          {activeCwpViews.length === 0 && (
                            <div className="p-10 text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-100">
                              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No hay vistas adicionales configuradas para este tipo de paquete.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'evidencia' && (
                    <CWPPhotoGallery cwpName={selectedCWP.name} discipline={selectedCWP.discipline} />
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-20 gap-8">
            <div className="relative">
              <div className="w-32 h-32 bg-white rounded-[3rem] shadow-xl flex items-center justify-center relative z-10">
                <Layout size={48} className="text-slate-200" />
              </div>
              <div className="absolute -inset-4 bg-brand-deep/5 rounded-[4rem] animate-pulse" />
              <div className="absolute top-0 -right-2 w-8 h-8 bg-brand-electric rounded-2xl flex items-center justify-center shadow-lg transform rotate-12">
                <Search size={14} className="text-white" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-black text-slate-900 italic tracking-tight uppercase">Dashboard CWP</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest max-w-xs leading-relaxed">
                Selecciona un paquete de trabajo del panel izquierdo para visualizar su avance, recursos y evidencias.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Editor de Reportes (Overlay) */}
      {showReportEditor && selectedCWP && (
        <CWPReportEditor
          cwp={selectedCWP}
          hhData={selectedCWP.hhData}
          customViews={customViews}
          manualViewIds={linkedViewIds}
          onAddManualView={handleLinkView}
          onClose={() => setShowReportEditor(false)}
        />
      )}
    </div>
  );
}
