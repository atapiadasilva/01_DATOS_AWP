'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, Plus, Trash2, Check, Settings, 
  X, Database, Layout, Eye, Search, 
  ChevronRight, Layers, Filter, CheckSquare, Square
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { EntityWithAttributes, CustomView } from '@/types';

interface CustomViewManagerProps {
  entities: EntityWithAttributes[];
  customViews: CustomView[];
  onRefresh: () => void;
  EmbeddedView: React.ComponentType<any>;
}

export default function CustomViewManager({ entities, customViews, onRefresh, EmbeddedView }: CustomViewManagerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingView, setEditingView] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    entity_id: '',
    columns: [] as string[],
    filter_key: ''
  });

  const filteredViews = useMemo(() => {
    if (!searchQuery) return customViews;
    return customViews.filter(v => v.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [customViews, searchQuery]);

  const selectedEntity = useMemo(() => {
    return entities.find(e => e.id === formData.entity_id);
  }, [entities, formData.entity_id]);

  const toggleColumn = (col: string) => {
    setFormData(prev => ({
      ...prev,
      columns: prev.columns.includes(col) 
        ? prev.columns.filter(c => c !== col)
        : [...prev.columns, col]
    }));
  };

  const handleSave = async () => {
    if (!formData.name || !formData.entity_id || formData.columns.length === 0) {
      alert('Favor completar nombre, tabla base y al menos una columna.');
      return;
    }

    try {
      const entity = entities.find(e => e.id === formData.entity_id);
      const payload = {
        name: formData.name,
        entity_id: formData.entity_id,
        columns: formData.columns,
        filter_key: formData.filter_key || null,
        project_id: (entity as any)?.project_id || null
      };

      let error;
      if (editingView) {
        const { error: err } = await supabase.from('custom_views').update(payload).eq('id', editingView.id);
        error = err;
      } else {
        const { error: err } = await supabase.from('custom_views').insert(payload);
        error = err;
      }

      if (error) throw error;
      
      setIsCreating(false);
      setEditingView(null);
      setFormData({ name: '', entity_id: '', columns: [], filter_key: '' });
      onRefresh();
    } catch (err) {
      console.error(err);
      alert('Error al guardar la vista personalizada.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta vista permanentemente?')) return;
    try {
      const { error } = await supabase.from('custom_views').delete().eq('id', id);
      if (error) throw error;
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const startEdit = (view: any) => {
    setEditingView(view);
    setFormData({
      name: view.name,
      entity_id: view.entity_id,
      columns: view.columns || [],
      filter_key: view.filter_key || ''
    });
    setIsCreating(true);
  };

  return (
    <div className="flex h-full gap-0 overflow-hidden bg-white">
      {/* Sidebar de Vistas */}
      <div className="w-96 shrink-0 bg-white border-r border-slate-100 flex flex-col overflow-hidden">
        <div className="p-10 border-b border-slate-100">
          <div className="flex items-center justify-between mb-8">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Vistas Maestras</h4>
            <button 
              onClick={() => { setIsCreating(true); setEditingView(null); setFormData({ name: '', entity_id: '', columns: [], filter_key: '' }); }}
              className="p-3 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all shadow-lg"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
            <input 
              type="text" 
              placeholder="Buscar vistas..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-bold outline-none focus:border-brand-electric"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {filteredViews.length === 0 && (
            <div className="text-center py-20 opacity-20">
              <Layout size={48} className="mx-auto mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest">Sin vistas configuradas</p>
            </div>
          )}
          {filteredViews.map(view => (
            <div key={view.id} className="group relative">
              <button 
                onClick={() => startEdit(view)}
                className={`w-full flex items-center justify-between p-6 rounded-[2rem] text-left transition-all ${
                  editingView?.id === view.id ? 'bg-slate-900 text-white shadow-xl' : 'bg-slate-50/50 hover:bg-slate-50'
                }`}
              >
                <div>
                  <h6 className="text-sm font-black italic mb-1">{view.name}</h6>
                  <p className={`text-[9px] font-black uppercase tracking-widest ${editingView?.id === view.id ? 'text-slate-400' : 'text-slate-300'}`}>
                    {entities.find(e => e.id === view.entity_id)?.name || 'Tabla no encontrada'}
                  </p>
                </div>
                <ChevronRight size={16} className={editingView?.id === view.id ? 'text-[#0C1E4F]' : 'text-slate-200'} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleDelete(view.id); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Área de Configuración */}
      <div className="flex-1 overflow-y-auto bg-slate-50/50 p-16">
        {isCreating ? (
          <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="flex items-center justify-between">
              <div>
                <h3 className="text-4xl font-black italic text-slate-900 tracking-tight">
                  {editingView ? 'Editar Vista Maestra' : 'Nueva Vista Maestra'}
                </h3>
                <p className="text-[10px] font-black text-[#0C1E4F] uppercase tracking-[0.3em] mt-3 italic">Configuración de Origen de Datos</p>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setIsCreating(false)} className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Cancelar</button>
                <button onClick={handleSave} className="px-10 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl flex items-center gap-3">
                  <Check size={16} /> {editingView ? 'Actualizar Vista' : 'Crear Vista Maestra'}
                </button>
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {/* Ajustes Básicos */}
              <div className="p-10 bg-white rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Nombre de la Vista</label>
                  <input 
                    type="text" 
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Log de Suministros, Control de Calidad..."
                    className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-brand-electric transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Tabla de Datos Base</label>
                  <select 
                    value={formData.entity_id}
                    onChange={e => setFormData({ ...formData, entity_id: e.target.value, columns: [] })}
                    className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-brand-electric transition-all appearance-none"
                  >
                    <option value="">Seleccionar base de datos...</option>
                    {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Columna de Filtrado (Opcional)</label>
                  <select 
                    value={formData.filter_key}
                    onChange={e => setFormData({ ...formData, filter_key: e.target.value })}
                    className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-brand-electric transition-all appearance-none"
                  >
                    <option value="">Ninguno (Mostrar todo)</option>
                    {formData.columns.map(c => <option key={c} value={c}>Filtrar por {c}</option>)}
                  </select>
                  <p className="text-[9px] text-slate-400 mt-3 italic font-medium px-1">
                    Idealmente CWP o EDT para que se sincronice automáticamente con el dashboard.
                  </p>
                </div>
              </div>

              {/* Selector de Columnas */}
              <div className="p-10 bg-white rounded-[3rem] border border-slate-100 shadow-sm flex flex-col h-full">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8 flex justify-between">
                  <span>Columnas de la Vista</span>
                  <span className="text-[#0C1E4F]">{formData.columns.length} Seleccionadas</span>
                </label>
                
                {!selectedEntity ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30 space-y-4">
                    <Database size={32} />
                    <p className="text-[10px] font-black uppercase tracking-widest">Selecciona una tabla primero</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto grid grid-cols-1 gap-3 pr-2 scrollbar-thin">
                    {(selectedEntity.attributes || []).map((attr: any) => {
                      const isSelected = formData.columns.includes(attr.name);
                      return (
                        <button 
                          key={attr.id}
                          onClick={() => toggleColumn(attr.name)}
                          className={`flex items-center gap-4 p-4 rounded-2xl transition-all border ${
                            isSelected ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          {isSelected ? <CheckSquare size={16} className="text-[#0C1E4F]" /> : <Square size={16} />}
                          <span className="text-[11px] font-black uppercase tracking-tight">{attr.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Previsualización en Tiempo Real */}
            {formData.entity_id && formData.columns.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-4 w-1 bg-[#0C1E4F] rounded-full" />
                  <h5 className="text-sm font-black italic uppercase text-slate-800 tracking-widest">Previsualización de la Vista</h5>
                </div>
                <div className="bg-white p-10 rounded-[3rem] border-2 border-slate-100 shadow-xl overflow-hidden min-h-[400px]">
                  <EmbeddedView 
                    viewName={formData.name || 'Vista Temporal'} 
                    customViews={[{ ...formData, id: 'preview' }]}
                    entities={entities}
                    isCompact={false}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-8">
            <div className="w-32 h-32 bg-white rounded-[2.5rem] shadow-xl flex items-center justify-center text-slate-100">
              <Layout size={64} />
            </div>
            <div className="max-w-md">
              <h3 className="text-3xl font-black italic text-slate-900 mb-4">Gestión de Vistas Maestras</h3>
              <p className="text-sm text-slate-400 font-bold mb-10 italic">
                Crea fuentes de datos personalizadas a partir de tus tablas. Estas vistas pueden ser vinculadas luego a los expedientes CWP para mostrar información específica.
              </p>
              <button 
                onClick={() => setIsCreating(true)}
                className="px-10 py-5 bg-slate-900 text-white rounded-[2rem] text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-2xl flex items-center gap-4 mx-auto"
              >
                <Plus size={20} /> Crear Nueva Vista
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
