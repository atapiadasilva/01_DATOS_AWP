'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Upload, FileText, Database, Settings, Trash2, Plus,
  Activity, X, Printer, Loader2, Save, Filter,
  ArrowRight, Check, ChevronRight, Layout, Network,
  BarChart3, Layers, Search, Eye,
  ArrowUp, ArrowDown,
  Link, Unlink, Edit3, StickyNote,
  TrendingUp, Clock, Target, ChevronDown,
  Camera, BookOpen, FileEdit
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  type Node as RFNode,
  type Edge as RFEdge
} from 'reactflow';
import 'reactflow/dist/style.css';

import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import ModelingCanvas from '@/components/modeling/ModelingCanvas';
import RelationalExplorer from '@/components/explorer/RelationalExplorer';
import IntegrityAudit from '@/components/audit/IntegrityAudit';
import WBSTreeView from '@/components/tree/WBSTreeView';
import DataEditor from '@/components/editor/DataEditor';
import CustomViewManager from '@/components/views/CustomViewManager';
import CWPMatrix from '@/components/matrix/CWPMatrix';
import GanttChart from '@/components/gantt/GanttChart';
import LoginPage from '@/components/auth/LoginPage';
import RolesManager from '@/components/settings/RolesManager';
import PlatformAdmin from '@/components/admin/PlatformAdmin';
import CwpDashboard from '@/components/cwp/CwpDashboard';
import EmbeddedView from '@/components/views/EmbeddedView';
import CWPMatcher from '@/components/mapping/CWPMatcher';
import SourceOfTruth from '@/components/config/SourceOfTruth';
import APSViewer from '@/components/viewer3d/APSViewer';
import ViewerWBSLayout  from '@/components/viewer3d/ViewerWBSLayout';
import Viewer4DLayout      from '@/components/viewer3d/Viewer4DLayout';
import WeeklyPlanLayout    from '@/components/weekly-plan/WeeklyPlanLayout';
import WeeklyPlan4DLayout  from '@/components/weekly-plan/WeeklyPlan4DLayout';
import CWPPhotoGallery from '@/components/cwp/CWPPhotoGallery';
import CWPReportEditor from '@/components/cwp/CWPReportEditor';

import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { useSourceOfTruth } from '@/hooks/useSourceOfTruth';
import { detectCwpColumn } from '@/lib/cwp-utils';

// ─── Discipline color system ──────────────────────────────────────────────────
const DISC_COLORS: Record<string, { bg: string; text: string; border: string; accent: string }> = {
  'CIVIL':              { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0', accent: '#22c55e' },
  'ESTRUCTURA':         { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', accent: '#3b82f6' },
  'ESTRUCTURAL':        { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', accent: '#3b82f6' },
  'MECANICO':           { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', accent: '#f97316' },
  'MECÁNICO':           { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', accent: '#f97316' },
  'MECANICA':           { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', accent: '#f97316' },
  'MECÁNICA':           { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', accent: '#f97316' },
  'ELECTRICO':          { bg: '#fefce8', text: '#a16207', border: '#fef08a', accent: '#eab308' },
  'ELÉCTRICO':          { bg: '#fefce8', text: '#a16207', border: '#fef08a', accent: '#eab308' },
  'ELECTRICA':          { bg: '#fefce8', text: '#a16207', border: '#fef08a', accent: '#eab308' },
  'ELÉCTRICA':          { bg: '#fefce8', text: '#a16207', border: '#fef08a', accent: '#eab308' },
  'INSTRUMENTACION':    { bg: '#faf5ff', text: '#7e22ce', border: '#e9d5ff', accent: '#a855f7' },
  'INSTRUMENTACIÓN':    { bg: '#faf5ff', text: '#7e22ce', border: '#e9d5ff', accent: '#a855f7' },
  'PIPING':             { bg: '#fff1f2', text: '#be123c', border: '#fecdd3', accent: '#f43f5e' },
  'TUBERIAS':           { bg: '#fff1f2', text: '#be123c', border: '#fecdd3', accent: '#f43f5e' },
  'TUBERÍAS':           { bg: '#fff1f2', text: '#be123c', border: '#fecdd3', accent: '#f43f5e' },
  'HVAC':               { bg: '#f0fdfa', text: '#0f766e', border: '#99f6e4', accent: '#14b8a6' },
  'ARQUITECTURA':       { bg: '#fdf2f8', text: '#9d174d', border: '#fbcfe8', accent: '#ec4899' },
  'PINTURA':            { bg: '#fffbeb', text: '#92400e', border: '#fde68a', accent: '#d97706' },
  'AISLACION':          { bg: '#f8fafc', text: '#475569', border: '#e2e8f0', accent: '#94a3b8' },
  'AISLACIÓN':          { bg: '#f8fafc', text: '#475569', border: '#e2e8f0', accent: '#94a3b8' },
  'GENERAL':            { bg: '#f1f5f9', text: '#334155', border: '#e2e8f0', accent: '#64748b' },
};
const DISC_FALLBACK = [
  { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd', accent: '#0ea5e9' },
  { bg: '#f5f3ff', text: '#5b21b6', border: '#ddd6fe', accent: '#8b5cf6' },
  { bg: '#fff0f6', text: '#9d174d', border: '#fbcfe8', accent: '#db2777' },
  { bg: '#f0fdf0', text: '#166534', border: '#bbf7d0', accent: '#16a34a' },
  { bg: '#fff8f0', text: '#9a3412', border: '#fed7aa', accent: '#ea580c' },
];
function getDiscColor(discipline: string) {
  const k = discipline.toUpperCase().trim();
  if (DISC_COLORS[k]) return DISC_COLORS[k];
  let hash = 0;
  for (let i = 0; i < k.length; i++) hash = (hash * 31 + k.charCodeAt(i)) & 0xffff;
  return DISC_FALLBACK[hash % DISC_FALLBACK.length];
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Home() {
  const { user, session, loading: authLoading } = useAuth();
  const { currentProject } = useProject();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('cwp-dashboard');

  const projectId = currentProject?.id;

  // ─── React Query: Datos base del proyecto ──────────────────────────
  const { data: entities = [] } = useQuery({
    queryKey: ['entities', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from('entities').select('*, attributes(*)').eq('project_id', projectId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!projectId,
  });

  const { data: relationships = [] } = useQuery({
    queryKey: ['relationships', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from('relationships').select(
        '*, parent_attr:attributes!parent_attribute_id(*, entity:entities(*)), child_attr:attributes!child_attribute_id(*, entity:entities(*))'
      ).eq('project_id', projectId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!projectId,
  });

  const { data: customViews = [] } = useQuery({
    queryKey: ['views', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from('custom_views').select('*').or(`project_id.eq.${projectId},is_global.eq.true`);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!projectId,
  });

  const invalidateProjectData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['entities', projectId] });
    queryClient.invalidateQueries({ queryKey: ['relationships', projectId] });
    queryClient.invalidateQueries({ queryKey: ['views', projectId] });
  }, [queryClient, projectId]);

  // ─── Estado Ingestión ──────────────────────────────────────────
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [newEntityName, setNewEntityName] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt: any) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' });
      const data: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      if (data.length > 0) { 
        setPreviewData(data.map((r, i) => ({ __id: i, ...r }))); 
        setColumns(Object.keys(data[0])); 
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleSaveIngestion = async () => {
    if (!currentProject?.id) return;
    setIsUploading(true);
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${session?.access_token}` 
        },
        body: JSON.stringify({ 
          projectId: currentProject.id, 
          entityName: newEntityName, 
          rows: previewData, 
          pkColumns: [], 
          strategy: 'replace', 
          columnTypes: {} 
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
      setPreviewData([]); setColumns([]); setNewEntityName('');
      invalidateProjectData();
      alert(`✓ Cargado exitosamente`);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally { setIsUploading(false); }
  };

  return (
    <main className="flex h-screen bg-brand-cloud text-brand-slate font-sans overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <section className="flex-1 flex flex-col min-w-0">
        <Topbar onTabChange={setActiveTab} />
        <header className="h-10 bg-white/70 backdrop-blur-xl border-b border-white/50 flex items-center px-8 shadow-sm z-10 shrink-0">
          <h2 className="text-xs font-black text-brand-deep/40 uppercase tracking-widest flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-brand-electric animate-pulse" />
            {activeTab.replace(/-/g, ' ').toUpperCase()}
            {currentProject && <span className="ml-2 text-brand-deep/20">— {currentProject.name}</span>}
          </h2>
        </header>

        <div className="flex-1 overflow-y-auto relative">
          {activeTab === 'cwp-dashboard' && (
            <CwpDashboard 
              projectId={projectId || ''} 
              entities={entities} 
              customViews={customViews} 
            />
          )}
          
          {activeTab === 'upload' && (
            <div className="p-10 max-w-xl mx-auto space-y-6">
               <div className="bg-white p-10 rounded-[2.5rem] border border-brand-cloud shadow-2xl text-center">
                  <div className="w-16 h-16 bg-brand-deep/5 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Upload className="text-brand-deep/30" size={32} />
                  </div>
                  <h3 className="text-xl font-black text-brand-deep mb-2">Importar Datos Maestro</h3>
                  <p className="text-xs text-slate-400 mb-8">Sube archivos .xlsx o .csv para crear nuevas tablas de datos.</p>
                  
                  <input type="file" onChange={handleFileUpload} className="hidden" id="file-upload" accept=".xlsx,.xls,.csv" />
                  <label htmlFor="file-upload" className="block w-full py-6 border-2 border-dashed border-brand-cloud rounded-[1.5rem] cursor-pointer hover:border-brand-electric/50 hover:bg-brand-electric/5 transition-all font-black text-slate-300 uppercase tracking-widest text-[10px]">
                    Seleccionar Archivo
                  </label>

                  {previewData.length > 0 && (
                    <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-bottom-2">
                      <div className="text-left">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Nombre de la tabla</label>
                        <input 
                          type="text" 
                          value={newEntityName} 
                          onChange={e => setNewEntityName(e.target.value)} 
                          placeholder="Ej: DATOS MASTER AWP" 
                          className="w-full p-4 bg-brand-cloud border-transparent rounded-xl text-xs font-bold outline-none focus:border-brand-electric" 
                        />
                      </div>
                      <button 
                        onClick={handleSaveIngestion} 
                        disabled={isUploading || !newEntityName.trim()} 
                        className="w-full py-4 bg-brand-deep text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-brand-deep/20 flex items-center justify-center gap-3 hover:bg-brand-electric transition-all"
                      >
                        {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        {isUploading ? 'Guardando...' : 'Confirmar Carga'}
                      </button>
                    </div>
                  )}
               </div>
            </div>
          )}

          {activeTab === 'pwps' && <DataEditor entities={entities} onRefresh={invalidateProjectData} />}
          
          {activeTab === 'modeling' && (
            <ModelingCanvas 
              initialNodes={entities.map((e, i) => ({ 
                id: e.id, 
                type: 'entityNode', 
                position: e.position_x != null ? { x: e.position_x, y: e.position_y } : { x: 100 + (i*50), y: 100 }, 
                data: { label: e.name, attributes: e.attributes } 
              }))} 
              initialEdges={relationships.map(r => ({ 
                id: r.id, 
                source: r.parent_attr?.entity_id, 
                target: r.child_attr?.entity_id,
                sourceHandle: r.parent_attr?.name,
                targetHandle: r.child_attr?.name,
                type: 'deletableEdge',
                label: `${r.parent_attr?.name} = ${r.child_attr?.name}`,
                markerEnd: { type: MarkerType.ArrowClosed }
              }))} 
              onSaveRelationship={async (conn) => {
                const { error } = await supabase.from('relationships').insert({
                  parent_attribute_id: entities.find(e => e.id === conn.source)?.attributes?.find((a: any) => a.name === conn.sourceHandle)?.id,
                  child_attribute_id: entities.find(e => e.id === conn.target)?.attributes?.find((a: any) => a.name === conn.targetHandle)?.id,
                  project_id: projectId,
                  cardinality: '1:N',
                  join_type: 'inner'
                });
                if (!error) invalidateProjectData();
              }} 
              onDeleteRelationship={async (id) => {
                await supabase.from('relationships').delete().eq('id', id);
                invalidateProjectData();
              }} 
              onSaveNodePosition={async (nodeId, x, y) => {
                await supabase.from('entities').update({ position_x: x, position_y: y }).eq('id', nodeId);
              }} 
            />
          )}

          {activeTab === 'explorer' && <RelationalExplorer entities={entities} relationships={relationships} onRefresh={invalidateProjectData} />}
          {activeTab === 'views' && <CustomViewManager entities={entities} customViews={customViews} onRefresh={invalidateProjectData} EmbeddedView={EmbeddedView} />}
          {activeTab === 'sot' && <SourceOfTruth entities={entities} projectId={projectId} />}
          {activeTab === 'programming' && <GanttChart />}
          {activeTab === 'scheduler' && <CWPMatcher programData={[]} cwpGroups={{}} projectId={projectId} onMappingsChange={() => {}} />}
          {activeTab === 'settings' && <RolesManager />}
          {activeTab === 'platform-admin' && <PlatformAdmin />}
          {activeTab === 'viewer3d' && <APSViewer />}
          {activeTab === 'viewer3d-wbs' && <ViewerWBSLayout />}
          {activeTab === 'viewer4d' && <Viewer4DLayout />}
          {activeTab === 'weekly-plan' && <WeeklyPlanLayout />}
          {activeTab === 'weekly-plan-4d' && <WeeklyPlan4DLayout />}
        </div>
      </section>
    </main>
  );
}
