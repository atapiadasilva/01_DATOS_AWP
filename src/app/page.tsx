'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
import CWPPhotoGallery from '@/components/cwp/CWPPhotoGallery';
import CWPReportEditor from '@/components/cwp/CWPReportEditor';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';

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

// ─── EmbeddedView ─────────────────────────────────────────────────────────────
const EmbeddedView = ({ viewName, filterValue, customViews, title, entities = [], isCompact = false }: {
  viewName: string; filterValue?: string; customViews: any[]; title?: string; entities?: any[]; isCompact?: boolean;
}) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newRow, setNewRow] = useState<Record<string, string>>({});
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  const view = useMemo(() => {
    let found = customViews.find(v => v.name.toLowerCase() === viewName.toLowerCase() || v.id === viewName);
    if (!found && entities.length > 0 && viewName) {
      const ent = entities.find(e => e.name && (e.name.toLowerCase().includes(viewName.toLowerCase()) || viewName.toLowerCase().includes(e.name.toLowerCase())));
      if (ent || selectedEntityId) {
        const targetEnt = selectedEntityId ? entities.find(e => e.id === selectedEntityId) : ent;
        return { id: 'temp', name: viewName, entity_id: targetEnt?.id || '', columns: (targetEnt as any)?.attributes?.map((a: any) => a.name) || [] };
      }
    }
    return found;
  }, [viewName, customViews, entities, selectedEntityId]);

  useEffect(() => {
    if (view?.entity_id && (!view.columns || view.columns.length === 0)) {
      supabase.from('attributes').select('name').eq('entity_id', view.entity_id).then(({ data: attrs }) => {
        if (attrs && attrs.length > 0) { (view as any).columns = attrs.map(a => a.name); loadViewData(); }
      });
    }
  }, [view?.entity_id]);

  const loadViewData = async () => {
    if (!view?.entity_id) { setLoading(false); return; }
    try {
      setLoading(true);
      let query = supabase.from('data_records').select('*').eq('entity_id', view.entity_id);
      const val = String(filterValue || '').replace(/[()]/g, '').trim();
      if (val) {
        const visibleKey = [view.filter_key, 'CWP', 'PACKAGE', 'PAQUETE', 'WBS', 'EDT', 'PLANO', 'DRAWING']
          .filter(Boolean).find(k => (view.columns || []).some((col: string) => col.toUpperCase().trim() === k.toUpperCase().trim()));
        if (visibleKey) {
          const exactKey = (view.columns || []).find((col: string) => col.toUpperCase().trim() === visibleKey.toUpperCase().trim());
          query = query.filter(`data->>${exactKey}`, 'ilike', `%${val}%`);
        } else {
          const filters = [view.filter_key, 'CWP', 'PACKAGE', 'PAQUETE', 'WBS', 'EDT', 'PLANO', 'DRAWING']
            .filter(Boolean).map(k => `data->>${k}.ilike.*${val}*`).join(',');
          query = query.or(filters);
        }
      }
      const { data: resultData, error } = await query.limit(isCompact ? 5 : 500);
      if (!error && resultData) {
        setData(resultData.map((r: any) => r.data ? { id: r.id, data: r.data } : { id: r.id, data: r }));
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  React.useEffect(() => { loadViewData(); }, [view, filterValue]);

  const handleDelete = async (recordId: string) => {
    if (!confirm('¿Eliminar este registro?')) return;
    const res = await fetch('/api/views/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', recordId, viewId: view?.id === 'temp' ? null : view?.id }) });
    if (res.ok) setData(prev => prev.filter(r => r.id !== recordId));
  };

  const handleSaveNew = async () => {
    if (!view?.entity_id) return;
    setIsSaving(true);
    const finalData = { ...newRow };
    if (view.filter_key && filterValue) finalData[view.filter_key] = filterValue;
    const res = await fetch('/api/views/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', entityId: view.entity_id, viewId: view.id === 'temp' ? null : view.id, data: finalData }) });
    if (res.ok) { loadViewData(); setNewRow({}); setIsAdding(false); }
    setIsSaving(false);
  };

  if (!view?.entity_id) {
    return (
      <div className="p-10 bg-white rounded-[2rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-center space-y-4">
        <Database size={28} className="text-slate-200" />
        <div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Vista no configurada: {viewName}</p>
          <select className="mt-2 w-full p-3 bg-brand-cloud border border-white/50 rounded-xl text-xs font-bold outline-none focus:border-brand-electric transition-all" onChange={e => setSelectedEntityId(e.target.value)} value={selectedEntityId || ''}>
            <option value="">Seleccionar base de datos...</option>
            {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className={isCompact ? '' : 'space-y-5'}>
      <div className={`flex justify-between items-center ${isCompact ? 'px-1 mb-2' : 'px-2'}`}>
        <div>
          {title && <h4 className={`${isCompact ? 'text-[10px]' : 'text-lg'} font-black text-slate-800 italic tracking-tight`}>{title}</h4>}
          <p className={`${isCompact ? 'text-[7px]' : 'text-[9px]'} font-black text-slate-400 uppercase tracking-widest mt-0.5`}>
            {data.length} registros{filterValue ? ` • Filtrado: ${filterValue}` : ''}
          </p>
        </div>
        {!isAdding && !isCompact && (
          <button onClick={() => setIsAdding(true)} className="px-4 py-2 bg-brand-deep text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 hover:bg-brand-electric transition-all shadow-lg shadow-brand-deep/20 print:hidden border border-white/10">
            <Plus size={13} /> Agregar
          </button>
        )}
      </div>
      {isAdding && (
        <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200 shadow-inner">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(view.columns || []).map((col: string) => (
              <div key={col}>
                <label className="block text-[9px] uppercase font-black text-brand-slate/60 mb-1.5 tracking-widest">{col}</label>
                <input type="text" value={newRow[col] || ''} onChange={e => setNewRow({ ...newRow, [col]: e.target.value })} className="w-full text-xs p-2.5 bg-white border border-brand-cloud rounded-xl outline-none focus:border-brand-electric transition-all" />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-3 pt-5">
            <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-slate-400 font-black text-[10px] uppercase">Cancelar</button>
            <button onClick={handleSaveNew} className="px-6 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase" disabled={isSaving}>{isSaving ? 'Guardando...' : 'Confirmar'}</button>
          </div>
        </div>
      )}
      <div className={`overflow-x-auto ${isCompact ? 'rounded-xl border border-slate-50' : 'rounded-[2rem] border border-slate-100 bg-white shadow-sm'} overflow-hidden`}>
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50/50">
            <tr>{(view.columns || []).map((col: string) => <th key={col} className="px-5 py-3.5 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">{col}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? <tr><td colSpan={100} className="py-16 text-center text-slate-400 text-[10px] italic"><Loader2 className="animate-spin inline mr-2" size={14} />Cargando...</td></tr>
              : data.length === 0 ? <tr><td colSpan={100} className="py-16 text-center text-slate-300 text-[10px] italic font-bold">Sin resultados</td></tr>
              : data.map((row, idx) => (
                <tr key={row.id || idx} className="hover:bg-slate-50/80 group transition-all">
                  {(view.columns || []).map((col: string) => <td key={col} className="px-5 py-3 text-xs text-slate-600 font-medium"><span className="truncate block max-w-[160px]">{row.data?.[col] ?? row[col]}</span></td>)}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Home() {
  const { user, loading: authLoading, hasPermission } = useAuth();
  const { currentProject } = useProject();

  const [activeTab, setActiveTab] = useState<string>('cwp-dashboard');
  const [entities, setEntities] = useState<any[]>([]);
  const [relationships, setRelationships] = useState<any[]>([]);
  const [customViews, setCustomViews] = useState<any[]>([]);
  const [selectedCWP, setSelectedCWP] = useState<any | null>(null);
  const [dashboardEntityId, setDashboardEntityId] = useState<string>('');
  const [cwpGroups, setCwpGroups] = useState<Record<string, Record<string, any>>>({});
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [officialDisciplines, setOfficialDisciplines] = useState<string[]>([]);

  // ─── CWP Dashboard: búsqueda y notas ──────────────────────────
  const [cwpSearch, setCwpSearch] = useState('');
  const [cwpNotes, setCwpNotes] = useState<Record<string, string>>({});
  const [selectedCWPTab, setSelectedCWPTab] = useState<'programa' | 'evidencia' | 'reporte'>('programa');
  const [showReportEditor, setShowReportEditor] = useState(false);

  // ─── HH del Programa (de gantt_program.json) ─────────────────
  const [ganttTasks, setGanttTasks] = useState<any[]>([]);
  useEffect(() => {
    fetch('/gantt_program.json')
      .then(r => r.json())
      .then((data: any[]) => setGanttTasks(data.map(d => ({
        ...d, hh: parseFloat(d.hh) || 0, pct: parseFloat(d.pct) || 0,
      }))));
  }, []);

  // HH por CWP: sólo hojas (sin doble conteo de padres)
  const cwpHHMap = useMemo(() => {
    const map: Record<string, { totalHH: number; doneHH: number; pct: number; tasks: any[] }> = {};
    const withCwp = ganttTasks.filter(t => t.cwp?.trim());
    const codes = Array.from(new Set(withCwp.map(t => t.cwp.trim())));
    codes.forEach(cwp => {
      const group = withCwp.filter(t => t.cwp.trim() === cwp);
      const leaves = group.filter(t => !group.some(o => o.edt.startsWith(t.edt + '.')));
      const totalHH = leaves.reduce((s, t) => s + t.hh, 0);
      const doneHH  = leaves.reduce((s, t) => s + t.hh * t.pct / 100, 0);
      map[cwp] = { totalHH, doneHH, pct: totalHH > 0 ? doneHH / totalHH * 100 : 0, tasks: leaves };
    });
    return map;
  }, [ganttTasks]);

  // Busca HH para un nombre de CWP (exacto o parcial)
  const getCwpHHData = (cwpName: string) => {
    if (cwpHHMap[cwpName]) return { key: cwpName, ...cwpHHMap[cwpName] };
    const key = Object.keys(cwpHHMap).find(k =>
      k.toLowerCase().includes(cwpName.toLowerCase()) ||
      cwpName.toLowerCase().includes(k.toLowerCase())
    );
    return key ? { key, ...cwpHHMap[key] } : null;
  };

  // ─── Upload ──────────────────────────────────────────────────────────
  const [selectedEntityForUpload, setSelectedEntityForUpload] = useState('');
  const [isCreatingNewEntity, setIsCreatingNewEntity] = useState(true);
  const [newEntityName, setNewEntityName] = useState('');
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // ─── Modal de conexión nodal (atributos) ─────────────────────────────
  const [pendingConnection, setPendingConnection] = useState<{ source: string; target: string } | null>(null);
  const [pendingAttrs, setPendingAttrs] = useState({ parentAttrId: '', childAttrId: '' });
  const [isSavingRelationship, setIsSavingRelationship] = useState(false);

  // ─── Carga inicial ────────────────────────────────────────────────────
  const loadInitialData = async () => {
    if (!user) return;

    // Build queries — filter by project_id when a project is selected
    let entQuery  = supabase.from('entities').select('*, attributes(*)');
    let relQuery  = supabase.from('relationships').select('*, parent_attr:attributes!parent_attribute_id(*, entity:entities(*)), child_attr:attributes!child_attribute_id(*, entity:entities(*))');
    let viewQuery = supabase.from('custom_views').select('*');

    if (currentProject?.id) {
      entQuery  = entQuery.eq('project_id',  currentProject.id) as typeof entQuery;
      relQuery  = relQuery.eq('project_id',  currentProject.id) as typeof relQuery;
      viewQuery = viewQuery.eq('project_id', currentProject.id) as typeof viewQuery;
    }

    const [entRes, relRes, viewRes] = await Promise.all([entQuery, relQuery, viewQuery]);
    if (entRes.data) {
      setEntities(entRes.data);
      const masterAwp = entRes.data.find((e: any) => e.name.toUpperCase() === 'DATOS GENERALES AWP');
      if (masterAwp) setDashboardEntityId(masterAwp.id);
      else setDashboardEntityId('');

      // Buscar entidad CWP x Disciplina para disciplinas oficiales
      const cwpDiscEntity = entRes.data.find((e: any) => {
        const n = e.name.toUpperCase().replace(/\s+/g, ' ').trim();
        return (n.includes('CWP') && (n.includes('DISCIPLINA') || n.includes('DISCIPLINE'))) ||
               n === 'CWP X DISCIPLINA' || n === 'CWP POR DISCIPLINA' || n === 'CWP DISCIPLINA';
      });
      if (cwpDiscEntity) {
        supabase.from('data_records').select('data').eq('entity_id', cwpDiscEntity.id)
          .then(({ data: dr }) => {
            if (dr) {
              const discs = Array.from(new Set(
                dr.map((r: any) => String(r.data?.DISCIPLINA || r.data?.DISCIPLINE || '').toUpperCase().trim())
                  .filter(Boolean)
              )).sort() as string[];
              setOfficialDisciplines(discs);
            }
          });
      }
    }
    if (relRes.data) setRelationships(relRes.data);
    if (viewRes.data) setCustomViews(viewRes.data);
  };

  useEffect(() => { loadInitialData(); }, [user, currentProject?.id]);

  // ─── Persistencia localStorage ────────────────────────────────────────
  useEffect(() => {
    const storedNotes = localStorage.getItem('awp_cwp_notes');
    if (storedNotes) setCwpNotes(JSON.parse(storedNotes));
  }, []);

  useEffect(() => {
    localStorage.setItem('awp_cwp_notes', JSON.stringify(cwpNotes));
  }, [cwpNotes]);

  // ─── Carga de datos del dashboard CWP ────────────────────────────────
  useEffect(() => {
    const loadDashboardData = async () => {
      if (!dashboardEntityId || activeTab !== 'cwp-dashboard') return;
      setIsLoadingDashboard(true);
      try {
        const { data, error } = await supabase.from('data_records').select('data').eq('entity_id', dashboardEntityId);
        if (!error && data) {
          const groups: Record<string, Record<string, any>> = {};
          data.forEach(r => {
            const rd = r.data || {};
            const cwpName = String(rd.CWP || rd.PACKAGE || 'SC-CWP');
            const discName = String(rd.DISCIPLINA || rd.DISCIPLINE || 'GENERAL').toUpperCase();
            const displayName = String(rd.NOMBRE_CWP || rd.NOMBRE_PAQUETE || rd.NOMBRE || rd.DESCRIPCION || rd.DESCRIPTION || '');
            if (!groups[discName]) groups[discName] = {};
            if (!groups[discName][cwpName]) groups[discName][cwpName] = { name: cwpName, displayName: '', activities: 0, discipline: discName, hh: 0, progress: 0 };
            if (!groups[discName][cwpName].displayName && displayName && displayName !== cwpName) {
              groups[discName][cwpName].displayName = displayName;
            }
            groups[discName][cwpName].activities++;
            groups[discName][cwpName].hh += Number(rd.HH || 0);
          });
          setCwpGroups(groups);
        }
      } catch (e) { console.error(e); } finally { setIsLoadingDashboard(false); }
    };
    loadDashboardData();
  }, [dashboardEntityId, activeTab]);

  // ─── Vistas globales (todas las vistas con filter_key activo) ────────
  const getCwpViews = () => customViews.filter(v => v.filter_key);

  // ─── Modal confirmación de relación ──────────────────────────────────
  const confirmRelationship = async () => {
    if (!pendingAttrs.parentAttrId || !pendingAttrs.childAttrId) return;
    setIsSavingRelationship(true);
    try {
      await supabase.from('relationships').insert({
        parent_attribute_id: pendingAttrs.parentAttrId,
        child_attribute_id: pendingAttrs.childAttrId
      });
      setPendingConnection(null);
      loadInitialData();
    } catch (err) { console.error(err); } finally { setIsSavingRelationship(false); }
  };

  // ─── Upload ───────────────────────────────────────────────────────────
  const handleFileUpload = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt: any) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' });
      const data: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      if (data.length > 0) { setPreviewData(data.map((r, i) => ({ __id: i, ...r }))); setColumns(Object.keys(data[0])); }
    };
    reader.readAsBinaryString(file);
  };

  const handleSaveIngestion = async () => {
    setIsUploading(true);
    await fetch('/api/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entityName: newEntityName, entityId: selectedEntityForUpload, data: previewData }) });
    setIsUploading(false);
    loadInitialData();
  };

  // ─── Nodos y aristas para ModelingCanvas ──────────────────────────────
  const initialNodes: RFNode[] = entities.map((ent, idx) => ({
    id: ent.id,
    type: 'entityNode',
    position: ent.position_x !== undefined ? { x: ent.position_x, y: ent.position_y } : { x: 100 + (idx * 250) % 800, y: 100 + (Math.floor(idx / 3) * 200) },
    data: { label: ent.name, attributes: ent.attributes || [] }
  }));

  const initialEdges: RFEdge[] = relationships.map(rel => ({
    id: rel.id,
    source: rel.parent_attr?.entity_id,
    target: rel.child_attr?.entity_id,
    type: 'deletableEdge',
    label: `${rel.parent_attr?.name} = ${rel.child_attr?.name}`,
    markerEnd: { type: MarkerType.ArrowClosed }
  }));

  const [treeData, setTreeData] = useState<any[]>([]);
  useEffect(() => {
    if (activeTab === 'tree' && dashboardEntityId) {
      supabase.from('data_records').select('data').eq('entity_id', dashboardEntityId)
        .then(({ data }) => { if (data) setTreeData(data.map(r => r.data)); });
    }
  }, [activeTab, dashboardEntityId]);

  // ─── CWP filtrados por búsqueda ──────────────────────────────────────
  const allCwps = useMemo(() =>
    Object.values(cwpGroups).flatMap(g => Object.values(g)),
    [cwpGroups]
  );

  const filteredCwps = useMemo(() => {
    if (!cwpSearch) return allCwps;
    const q = cwpSearch.toLowerCase();
    return allCwps.filter((cwp: any) =>
      cwp.name.toLowerCase().includes(q) || cwp.discipline.toLowerCase().includes(q)
    );
  }, [allCwps, cwpSearch]);

  // ─── Source/Target attrs para modal de relación ──────────────────────
  const sourceEntity = pendingConnection ? entities.find(e => e.id === pendingConnection.source) : null;
  const targetEntity = pendingConnection ? entities.find(e => e.id === pendingConnection.target) : null;

  // ── Auth guard ──────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-brand-deep flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin text-brand-electric" />
          <p className="text-brand-electric/50 text-xs font-black uppercase tracking-widest">Iniciando...</p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <main className="flex h-screen bg-brand-cloud text-brand-slate font-sans overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <section className="flex-1 flex flex-col min-w-0">
        <Topbar onTabChange={setActiveTab} />
        <header className="h-10 bg-white/70 backdrop-blur-xl border-b border-white/50 flex items-center px-8 shadow-sm z-10 shrink-0">
          <h2 className="text-xs font-black text-brand-deep/40 uppercase tracking-widest flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-brand-electric animate-pulse" />
            {activeTab.replace(/-/g, ' ').toUpperCase()}
            {currentProject && (
              <span className="ml-2 text-brand-deep/20">— {currentProject.name}</span>
            )}
          </h2>
        </header>

        <div className="flex-1 overflow-y-auto relative">

          {/* ─── CWP DASHBOARD ─── */}
          {activeTab === 'cwp-dashboard' && (
            <div className="p-8">
              {/* Búsqueda y stats */}
              <div className="flex items-center gap-4 mb-6">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                  <input
                    type="text"
                    placeholder="Buscar CWP, disciplina..."
                    value={cwpSearch}
                    onChange={e => setCwpSearch(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-white border border-brand-cloud rounded-2xl text-xs font-bold outline-none focus:border-brand-electric shadow-lg shadow-brand-deep/5 transition-all"
                  />
                  {cwpSearch && (
                    <button onClick={() => setCwpSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                      <X size={12} />
                    </button>
                  )}
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {isLoadingDashboard ? 'Cargando...' : `${filteredCwps.length} de ${allCwps.length} CWPs`}
                </span>
              </div>

              {/* ── Simbología de disciplinas ── */}
              {(officialDisciplines.length > 0 || Object.keys(cwpGroups).length > 0) && (
                <div className="mb-6 p-4 bg-white rounded-2xl border border-brand-cloud shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Simbología de Disciplinas</p>
                    {officialDisciplines.length > 0 && (
                      <span className="text-[7px] font-black px-1.5 py-0.5 rounded-full bg-brand-electric/10 text-brand-electric uppercase tracking-wider">oficial</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {(officialDisciplines.length > 0 ? officialDisciplines : Object.keys(cwpGroups)).map(disc => {
                      const c = getDiscColor(disc);
                      const cwpCount = cwpGroups[disc] ? Object.keys(cwpGroups[disc]).length : null;
                      return (
                        <div key={disc} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest"
                          style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}>
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.accent }} />
                          {disc}
                          {cwpCount !== null && (
                            <span className="ml-1 opacity-60">{cwpCount}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Grilla de CWPs por disciplina */}
              {Object.entries(cwpGroups).map(([discipline, cwps]) => {
                const disciplineCwps = Object.values(cwps).filter((cwp: any) => filteredCwps.includes(cwp));
                if (disciplineCwps.length === 0) return null;
                return (
                  <div key={discipline} className="mb-8">
                    {(() => { const dc = getDiscColor(discipline); return (
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-4 w-1.5 rounded-full" style={{ backgroundColor: dc.accent }} />
                      <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: dc.text }}>{discipline}</h3>
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full border" style={{ backgroundColor: dc.bg, color: dc.text, borderColor: dc.border }}>
                        {disciplineCwps.length} CWP{disciplineCwps.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    ); })()}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {disciplineCwps.map((cwp: any) => {
                        const globalViewCount = getCwpViews().length;
                        const hhData = getCwpHHData(cwp.name);
                        // HH a mostrar: preferir Gantt, luego Supabase
                        const displayHH = hhData?.totalHH ?? cwp.hh ?? 0;
                        const displayPct = hhData?.pct ?? 0;
                        const dc = getDiscColor(discipline);
                        return (
                          <div
                            key={cwp.name}
                            onClick={() => { setSelectedCWP(cwp); setSelectedCWPTab('programa'); }}
                            className="bg-white/90 backdrop-blur-md p-5 rounded-[1.75rem] shadow-lg shadow-brand-deep/5 cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all group relative overflow-hidden min-h-[170px] flex flex-col"
                            style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: dc.border, borderLeftWidth: '4px', borderLeftColor: dc.accent }}
                          >
                            <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                              <ArrowRight size={12} style={{ color: dc.accent }} />
                            </div>
                            {/* Badge disciplina */}
                            <div className="inline-flex items-center gap-1.5 self-start px-2 py-0.5 rounded-full mb-2.5 text-[8px] font-black uppercase tracking-widest border shrink-0"
                              style={{ backgroundColor: dc.bg, color: dc.text, borderColor: dc.border }}>
                              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dc.accent }} />
                              {cwp.discipline}
                            </div>
                            {/* Descripción CWP — texto principal grande */}
                            <h5 className="text-[15px] font-black text-slate-800 group-hover:text-brand-deep transition-colors line-clamp-2 leading-snug pr-5">
                              {cwp.displayName || cwp.name}
                            </h5>
                            {/* Código CWP — secundario pequeño */}
                            <p className="text-[9px] font-black uppercase tracking-widest mt-1" style={{ color: dc.text, opacity: 0.7 }}>
                              {cwp.displayName ? cwp.name : ''}
                            </p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{cwp.activities} Act.</p>

                            {/* HH del programa */}
                            {displayHH > 0 && (
                              <div className="mt-3 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">HH</span>
                                  <span className="text-[10px] font-black text-brand-deep">
                                    {displayHH.toLocaleString('es-CL', { maximumFractionDigits: 0 })} h
                                  </span>
                                </div>
                                {displayPct > 0 && (
                                  <div>
                                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${displayPct === 100 ? 'bg-brand-deep' : 'bg-brand-electric'}`}
                                        style={{ width: `${displayPct}%` }}
                                      />
                                    </div>
                                    <p className="text-[7px] font-black text-brand-slate/40 mt-0.5 text-right">{displayPct.toFixed(0)}% avance</p>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="flex-1" />
                            {globalViewCount > 0 && (
                              <div className="mt-2 flex items-center gap-1">
                                <Layout size={9} style={{ color: dc.accent }} />
                                <span className="text-[9px] font-black" style={{ color: dc.text }}>{globalViewCount} vistas</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {filteredCwps.length === 0 && !isLoadingDashboard && (
                <div className="flex flex-col items-center justify-center h-60 text-center gap-4 opacity-30">
                  <BarChart3 size={48} className="text-slate-300" />
                  <p className="font-black text-slate-500 uppercase tracking-widest text-xs">
                    {cwpSearch ? 'Sin resultados' : 'Carga datos en "DATOS GENERALES AWP" para ver los CWPs'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ─── UPLOAD ─── */}
          {activeTab === 'upload' && (
            <div className="p-8 space-y-8">
              <div className="p-10 bg-white rounded-[3rem] border border-slate-100 shadow-xl max-w-2xl">
                <h3 className="text-2xl font-black italic mb-6">Ingesta de Datos</h3>
                <input type="file" onChange={handleFileUpload} className="mb-6 text-sm" accept=".xlsx,.xls,.csv" />
                {previewData.length > 0 && (
                  <div className="space-y-4">
                    <p className="text-xs font-bold text-slate-500">{previewData.length} filas detectadas · {columns.length} columnas</p>
                    <input
                      type="text"
                      placeholder="Nombre de la tabla..."
                      value={newEntityName}
                      onChange={e => setNewEntityName(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-brand-electric"
                    />
                    <button onClick={handleSaveIngestion} disabled={isUploading} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3">
                      {isUploading ? <><Loader2 className="animate-spin" size={18} />Guardando...</> : <><Upload size={18} />Guardar Datos</>}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── EDITOR DE DATOS ─── */}
          {activeTab === 'pwps' && (
            <div className="h-[calc(100vh-64px)] w-full">
              <DataEditor entities={entities} />
            </div>
          )}

          {/* ─── WBS TREE ─── */}
          {activeTab === 'tree' && (
            <div className="p-8 bg-slate-50 min-h-full">
              <WBSTreeView data={treeData} edtKey="EDT" />
            </div>
          )}

          {/* ─── MAPA NODAL ─── */}
          {activeTab === 'modeling' && (
            <div className="p-6 h-[calc(100vh-64px)]">
              <div className="mb-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                <Network size={16} className="text-[#0C1E4F]" />
                <p className="text-xs font-bold text-slate-500">
                  Arrastra desde el handle de un nodo hacia otro para crear una conexión. Puedes seleccionar exactamente qué columnas conectar.
                </p>
                <span className="text-[10px] font-black text-slate-300 ml-auto">{relationships.length} relaciones · {entities.length} entidades</span>
              </div>
              <ModelingCanvas
                initialNodes={initialNodes}
                initialEdges={initialEdges}
                onSaveRelationship={async (conn) => {
                  const src = entities.find(e => e.id === conn.source);
                  const tgt = entities.find(e => e.id === conn.target);
                  setPendingConnection({ source: conn.source!, target: conn.target! });
                  setPendingAttrs({
                    parentAttrId: src?.attributes?.[0]?.id || '',
                    childAttrId: tgt?.attributes?.[0]?.id || ''
                  });
                }}
                onDeleteRelationship={async (id) => {
                  await supabase.from('relationships').delete().eq('id', id);
                  loadInitialData();
                }}
                onSaveNodePosition={async (nodeId, x, y) => {
                  await supabase.from('entities').update({ position_x: x, position_y: y }).eq('id', nodeId);
                }}
              />
            </div>
          )}

          {/* ─── EXPLORADOR RELACIONAL ─── */}
          {activeTab === 'explorer' && (
            <div className="h-[calc(100vh-64px)] w-full">
              <RelationalExplorer entities={entities} relationships={relationships} onRefresh={loadInitialData} />
            </div>
          )}

          {/* ─── AUDITORÍA ─── */}
          {activeTab === 'audit' && (
            <div className="p-8">
              <IntegrityAudit entities={entities} relationships={relationships} />
            </div>
          )}

          {/* ─── VISTAS PERSONALIZADAS ─── */}
          {activeTab === 'views' && (
            <div className="h-[calc(100vh-64px)] w-full">
              <CustomViewManager
                entities={entities}
                customViews={customViews}
                onRefresh={loadInitialData}
                EmbeddedView={EmbeddedView}
              />
            </div>
          )}

          {/* ─── MATRIZ CWP ─── */}
          {activeTab === 'matrix' && (
            <div className="h-[calc(100vh-64px)] w-full overflow-auto">
              <CWPMatrix
                cwpGroups={cwpGroups}
                customViews={customViews}
                entities={entities}
                onSelectCWP={(cwpName) => {
                  const found = allCwps.find((c: any) => c.name === cwpName);
                  if (found) { setSelectedCWP(found); setSelectedCWPTab('programa'); setActiveTab('cwp-dashboard'); }
                }}
              />
            </div>
          )}

          {/* ─── CARTA GANTT ─── */}
          {activeTab === 'programming' && (
            <div className="h-[calc(100vh-64px)] w-full">
              <GanttChart />
            </div>
          )}

          {/* ─── Settings / Roles ─── */}
          {activeTab === 'settings' && (
            <div className="overflow-y-auto">
              <RolesManager />
            </div>
          )}

          {/* ─── Módulos pendientes ─── */}
          {['drawing-log'].includes(activeTab) && (
            <div className="p-10 flex items-center justify-center min-h-full">
              <div className="p-12 bg-white rounded-[3rem] border border-slate-100 shadow-xl text-center max-w-md">
                <h3 className="text-xl font-black mb-3 italic uppercase">{activeTab}</h3>
                <p className="text-slate-400 font-bold italic text-sm">Módulo bajo integración de datos maestros.</p>
              </div>
            </div>
          )}

        </div>
      </section>

      {/* ─────────────────── PANEL DETALLE CWP ─────────────────── */}
      {selectedCWP && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="h-16 bg-brand-deep flex items-center justify-between px-8 shadow-2xl text-white shrink-0 border-b border-white/5">
            <div className="flex items-center gap-5">
              <button onClick={() => setSelectedCWP(null)} className="p-2.5 bg-white/10 rounded-xl hover:bg-white/20 transition-all">
                <X size={18} />
              </button>
              <div>
                <h3 className="text-lg font-black italic leading-none">
                  {selectedCWP.displayName || selectedCWP.name}
                </h3>
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-0.5">
                  {selectedCWP.displayName ? `${selectedCWP.name} · ` : ''}{selectedCWP.discipline}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowReportEditor(true)}
                className="px-4 py-2 bg-brand-electric/20 text-brand-electric rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-brand-electric/30 transition-all border border-brand-electric/30"
              >
                <FileEdit size={12} /> Editor de Reporte
              </button>
              <button onClick={() => window.print()} className="px-5 py-2 bg-white/10 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all">
                <Printer size={12} className="inline mr-1.5" />Imprimir
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="h-11 bg-white border-b border-brand-cloud flex items-center px-6 gap-1 shrink-0 print:hidden">
            {([
              { id: 'programa', label: 'Programa & Vistas', icon: BarChart3 },
              { id: 'evidencia', label: 'Evidencia Fotográfica', icon: Camera },
            ] as { id: 'programa' | 'evidencia' | 'reporte'; label: string; icon: any }[]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setSelectedCWPTab(id)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  selectedCWPTab === id
                    ? 'bg-brand-deep text-white shadow'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-brand-cloud'
                }`}
              >
                <Icon size={11} /> {label}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar izquierdo: stats + HH + notas */}
            <div className="w-72 bg-brand-cloud/30 border-r border-brand-cloud flex flex-col p-6 space-y-5 overflow-y-auto shrink-0">
              {/* Stats base */}
              <div className="bg-white rounded-[2rem] border border-brand-cloud p-5 space-y-3 shadow-sm">
                <p className="text-[9px] font-black text-brand-slate/40 uppercase tracking-widest">Resumen</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-brand-slate/60">Actividades</span>
                    <span className="text-sm font-black text-brand-deep">{selectedCWP.activities}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-brand-slate/60">Vistas activas</span>
                    <span className="text-sm font-black text-brand-electric">{getCwpViews().length}</span>
                  </div>
                </div>
              </div>

              {/* ─── HH del Programa ─── */}
              {(() => {
                const hhData = getCwpHHData(selectedCWP.name);
                const totalHH = hhData?.totalHH ?? selectedCWP.hh ?? 0;
                const doneHH  = hhData?.doneHH  ?? 0;
                const pct     = hhData?.pct      ?? 0;
                const remainHH = totalHH - doneHH;
                if (totalHH === 0) return null;
                return (
                  <div className="bg-brand-deep rounded-[2rem] p-5 space-y-4 shadow-xl shadow-brand-deep/20">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={12} className="text-brand-electric" />
                      <p className="text-[9px] font-black text-brand-electric/80 uppercase tracking-widest">HH Programa</p>
                    </div>

                    {/* Barra global */}
                    <div>
                      <div className="flex justify-between text-[8px] font-black text-white/50 mb-1.5">
                        <span>Avance</span>
                        <span className="text-brand-orange">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand-orange to-brand-electric transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Métricas HH */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Total', val: totalHH, color: 'text-white' },
                        { label: 'Ejec.', val: doneHH,  color: 'text-brand-electric' },
                        { label: 'Rest.', val: remainHH, color: 'text-brand-orange' },
                      ].map(({ label, val, color }) => (
                        <div key={label} className="bg-white/5 rounded-xl p-2 text-center">
                          <p className="text-[7px] font-black uppercase tracking-widest text-white/40">{label}</p>
                          <p className={`text-[10px] font-black mt-0.5 ${color}`}>
                            {val.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                          </p>
                          <p className="text-[6px] font-bold text-white/30">h</p>
                        </div>
                      ))}
                    </div>

                    {/* Actividades vinculadas */}
                    {hhData && hhData.tasks.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[7px] font-black text-white/30 uppercase tracking-widest">
                          {hhData.tasks.length} actividades vinculadas
                        </p>
                        <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                          {hhData.tasks.map((t: any) => (
                            <div key={t.edt} className="bg-white/5 rounded-lg px-2 py-1.5">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[7px] font-black text-brand-electric/70 shrink-0">{t.edt}</span>
                                <span className="text-[7px] font-black text-brand-orange shrink-0">
                                  {t.hh > 0 ? `${t.hh.toLocaleString('es-CL', { maximumFractionDigits: 0 })} h` : '—'}
                                </span>
                              </div>
                              <p className="text-[7px] font-medium text-white/50 truncate mt-0.5">{t.name}</p>
                              {t.hh > 0 && (
                                <div className="h-0.5 bg-white/10 rounded-full overflow-hidden mt-1">
                                  <div
                                    className="h-full bg-brand-electric/70 rounded-full"
                                    style={{ width: `${t.pct}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Notas */}
              <div className="bg-white rounded-[2rem] border border-slate-100 p-5 space-y-3 flex flex-col">
                <div className="flex items-center gap-2">
                  <StickyNote size={12} className="text-brand-electric" />
                  <p className="text-[9px] font-black text-brand-slate/40 uppercase tracking-widest">Notas del CWP</p>
                </div>
                <textarea
                  value={cwpNotes[selectedCWP.name] || ''}
                  onChange={e => setCwpNotes(prev => ({ ...prev, [selectedCWP.name]: e.target.value }))}
                  placeholder="Agrega notas, observaciones, pendientes..."
                  rows={6}
                  className="w-full p-3 bg-brand-cloud border border-brand-cloud rounded-xl text-xs font-medium outline-none focus:border-brand-electric resize-none transition-all"
                />
                <p className="text-[8px] text-slate-300 font-bold italic">Guardado automáticamente</p>
              </div>

              {/* Lista de vistas activas (acceso rápido) */}
              {getCwpViews().length > 0 && (
                <div className="bg-white rounded-[2rem] border border-slate-100 p-5 space-y-2">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Módulos activos</p>
                  {getCwpViews().map(view => (
                    <div key={view.id} className="flex items-center py-1">
                      <span className="text-[10px] font-black text-slate-700 truncate">{view.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Área principal: tabbed content */}
            {selectedCWPTab === 'evidencia' && (
              <div className="flex-1 overflow-y-auto p-10">
                <CWPPhotoGallery cwpName={selectedCWP.name} discipline={selectedCWP.discipline} />
              </div>
            )}
            <div className={`flex-1 overflow-y-auto p-10 space-y-10 ${selectedCWPTab !== 'programa' ? 'hidden' : ''}`}>

              {/* ─── Tabla HH del programa para este CWP ─── */}
              {(() => {
                const hhData = getCwpHHData(selectedCWP.name);
                if (!hhData || hhData.tasks.length === 0) return null;
                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-1 bg-brand-electric rounded-full shadow-[0_0_8px_rgba(0,191,255,0.5)]" />
                      <h4 className="text-xl font-black italic text-brand-deep">HH del Programa</h4>
                      <span className="text-[9px] font-black text-brand-slate/30 uppercase tracking-widest">
                        {hhData.key}
                      </span>
                    </div>

                    {/* Métricas rápidas */}
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { label: 'HH Totales',    val: hhData.totalHH, sub: '100%',                          color: 'text-brand-deep', bg: 'bg-brand-deep/5 border-brand-deep/10' },
                        { label: 'HH Ejecutadas', val: hhData.doneHH,  sub: `${hhData.pct.toFixed(1)}%`,     color: 'text-brand-electric', bg: 'bg-brand-electric/5 border-brand-electric/20' },
                        { label: 'HH Restantes',  val: hhData.totalHH - hhData.doneHH, sub: `${(100 - hhData.pct).toFixed(1)}%`, color: 'text-brand-orange', bg: 'bg-brand-orange/5 border-brand-orange/20' },
                      ].map(({ label, val, sub, color, bg }) => (
                        <div key={label} className={`rounded-[2rem] border p-5 ${bg}`}>
                          <p className="text-[9px] font-black uppercase tracking-widest text-brand-slate/40">{label}</p>
                          <p className={`text-2xl font-black mt-1 ${color}`}>
                            {val.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                            <span className="text-sm ml-1">h</span>
                          </p>
                          <p className={`text-[9px] font-bold mt-0.5 ${color} opacity-60`}>{sub}</p>
                        </div>
                      ))}
                    </div>

                    {/* Barra de avance */}
                    <div className="bg-white rounded-[2rem] border border-brand-cloud p-5">
                      <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-brand-slate/40 mb-3">
                        <span>Avance global del CWP</span>
                        <span className="text-brand-electric">{hhData.pct.toFixed(1)}%</span>
                      </div>
                      <div className="h-3 bg-brand-cloud rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-brand-electric to-brand-deep rounded-full transition-all duration-700"
                          style={{ width: `${hhData.pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Tabla de actividades */}
                    <div className="bg-white rounded-[2rem] border border-brand-cloud overflow-hidden shadow-sm">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-brand-deep text-white">
                          <tr>
                            <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest">EDT</th>
                            <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest">Actividad</th>
                            <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest text-right">HH</th>
                            <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest text-right">HH Ejec.</th>
                            <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest">Avance</th>
                            <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest">Inicio</th>
                            <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest">Fin</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-cloud">
                          {hhData.tasks.map((t: any, i: number) => (
                            <tr key={t.edt} className={i % 2 === 0 ? 'bg-white' : 'bg-brand-cloud/20'}>
                              <td className="px-4 py-3 text-[9px] font-black text-brand-deep/60">{t.edt}</td>
                              <td className="px-4 py-3 text-[10px] font-bold text-brand-slate/80 max-w-xs">
                                <span className="line-clamp-2">{t.name}</span>
                              </td>
                              <td className="px-4 py-3 text-[10px] font-black text-brand-deep text-right">
                                {t.hh > 0 ? t.hh.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + ' h' : '—'}
                              </td>
                              <td className="px-4 py-3 text-[10px] font-black text-brand-electric text-right">
                                {t.hh > 0 ? (t.hh * t.pct / 100).toLocaleString('es-CL', { maximumFractionDigits: 0 }) + ' h' : '—'}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-brand-cloud rounded-full overflow-hidden min-w-[60px]">
                                    <div
                                      className={`h-full rounded-full ${t.pct === 100 ? 'bg-brand-deep' : t.pct > 0 ? 'bg-brand-electric' : 'bg-slate-200'}`}
                                      style={{ width: `${t.pct}%` }}
                                    />
                                  </div>
                                  <span className={`text-[9px] font-black w-8 text-right shrink-0 ${t.pct === 100 ? 'text-brand-deep' : t.pct > 0 ? 'text-brand-electric' : 'text-brand-slate/30'}`}>
                                    {t.pct}%
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-[9px] text-brand-slate/50 font-medium">{t.aStart}</td>
                              <td className="px-4 py-3 text-[9px] text-brand-slate/50 font-medium">{t.aEnd}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-brand-cloud/40 border-t-2 border-brand-cloud">
                          <tr>
                            <td colSpan={2} className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-brand-deep">Total</td>
                            <td className="px-4 py-3 text-[10px] font-black text-brand-deep text-right">
                              {hhData.totalHH.toLocaleString('es-CL', { maximumFractionDigits: 0 })} h
                            </td>
                            <td className="px-4 py-3 text-[10px] font-black text-brand-electric text-right">
                              {hhData.doneHH.toLocaleString('es-CL', { maximumFractionDigits: 0 })} h
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-[9px] font-black text-brand-orange">{hhData.pct.toFixed(1)}%</span>
                            </td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {getCwpViews().length === 0 ? (
                <div className="flex flex-col items-center justify-center h-80 gap-6 text-center">
                  <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center text-slate-200 shadow-inner">
                    <Layout size={48} />
                  </div>
                  <div className="max-w-sm">
                    <p className="text-xl font-black italic text-slate-700 mb-2">Sin vistas configuradas</p>
                    <p className="text-sm text-slate-400 font-bold italic">
                      Crea vistas personalizadas con un filtro activo en el módulo <span className="text-[#0C1E4F] font-black">Vistas Personalizadas</span>. Aparecerán aquí automáticamente para todos los CWPs.
                    </p>
                  </div>
                </div>
              ) : (
                getCwpViews().map(view => (
                  <div key={view.id} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-1 bg-[#0C1E4F] rounded-full" />
                      <h4 className="text-xl font-black italic text-slate-900">{view.name}</h4>
                      <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
                        {entities.find(e => e.id === view.entity_id)?.name}
                      </span>
                    </div>
                    <EmbeddedView
                      viewName={view.id}
                      filterValue={selectedCWP.name}
                      customViews={customViews}
                      entities={entities}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────── EDITOR DE REPORTE CWP ─────────────────── */}
      {showReportEditor && selectedCWP && (
        <CWPReportEditor
          cwp={selectedCWP}
          hhData={(() => { const d = getCwpHHData(selectedCWP.name); return d && d.totalHH > 0 ? d : null; })()}
          customViews={customViews}
          onClose={() => setShowReportEditor(false)}
        />
      )}

      {/* ─────────────────── MODAL CONEXIÓN NODAL ─────────────────── */}
      {pendingConnection && sourceEntity && targetEntity && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6">
          <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden">
            <div className="p-8 border-b border-slate-100">
              <h3 className="text-xl font-black italic text-slate-900">Configurar Relación</h3>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Define qué columnas conectan estas tablas</p>
            </div>
            <div className="p-8 space-y-6">
              {/* Visualización de la relación */}
              <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-2xl">
                <div className="flex-1 text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Origen</p>
                  <p className="font-black text-slate-900 text-sm">{sourceEntity.name}</p>
                </div>
                <ArrowRight size={20} className="text-[#0C1E4F] shrink-0" />
                <div className="flex-1 text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Destino</p>
                  <p className="font-black text-slate-900 text-sm">{targetEntity.name}</p>
                </div>
              </div>

              {/* Selector de columnas */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Columna en {sourceEntity.name}
                  </label>
                  <select
                    value={pendingAttrs.parentAttrId}
                    onChange={e => setPendingAttrs(prev => ({ ...prev, parentAttrId: e.target.value }))}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-brand-electric"
                  >
                    <option value="">Seleccionar...</option>
                    {(sourceEntity.attributes || []).map((a: any) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Columna en {targetEntity.name}
                  </label>
                  <select
                    value={pendingAttrs.childAttrId}
                    onChange={e => setPendingAttrs(prev => ({ ...prev, childAttrId: e.target.value }))}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-brand-electric"
                  >
                    <option value="">Seleccionar...</option>
                    {(targetEntity.attributes || []).map((a: any) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="px-8 pb-8 flex gap-3">
              <button
                onClick={() => setPendingConnection(null)}
                className="flex-1 py-3 text-slate-400 font-black text-[10px] uppercase tracking-widest"
              >
                Cancelar
              </button>
              <button
                onClick={confirmRelationship}
                disabled={!pendingAttrs.parentAttrId || !pendingAttrs.childAttrId || isSavingRelationship}
                className="flex-1 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-40 transition-all"
              >
                {isSavingRelationship ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                Crear Relación
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
