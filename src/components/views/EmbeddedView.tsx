'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Database, Plus, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRelationalData } from '@/hooks/useRelationalData';
import { detectCwpColumn } from '@/lib/cwp-utils';

interface EmbeddedViewProps {
  viewName: string;
  filterValue?: string;
  customViews: any[];
  entities?: any[];
  isCompact?: boolean;
  title?: string;
  mappings?: any[];
}

export default function EmbeddedView({ 
  viewName, 
  filterValue, 
  customViews, 
  title, 
  entities = [], 
  isCompact = false,
  mappings = []
}: EmbeddedViewProps) {
  const { session } = useAuth();
  const { fetchData, isLoading } = useRelationalData();
  const [data, setData] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newRow, setNewRow] = useState<Record<string, string>>({});
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  // 1. Resolver la definición de la vista
  const view = useMemo(() => {
    let found = customViews.find(v => v.name.toLowerCase() === viewName.toLowerCase() || v.id === viewName);
    
    // Si la vista es global, intentar resolver entity_id por nombre en el proyecto actual
    if (found?.is_global && found.entity_name) {
      const localEnt = entities.find(e => e.name?.toLowerCase() === found.entity_name?.toLowerCase());
      if (localEnt) {
        found = { ...found, entity_id: localEnt.id };
      }
    }

    // Si no se encuentra, intentar buscar una entidad con nombre similar (Fuzzy match)
    if (!found && entities.length > 0 && viewName) {
      const ent = entities.find(e => e.name && (
        e.name.toLowerCase().includes(viewName.toLowerCase()) || 
        viewName.toLowerCase().includes(e.name.toLowerCase())
      ));
      if (ent || selectedEntityId) {
        const targetEnt = selectedEntityId ? entities.find(e => e.id === selectedEntityId) : ent;
        return { 
          id: 'temp', 
          name: viewName, 
          entity_id: targetEnt?.id || '', 
          columns: (targetEnt as any)?.attributes?.map((a: any) => a.name) || [] 
        };
      }
    }
    return found;
  }, [viewName, customViews, entities, selectedEntityId]);

  // 2. Cargar datos usando el hook unificado
  const loadData = async () => {
    if (!view?.entity_id) return;
    
    const result = await fetchData({
      entityId: view.entity_id,
      filterValue: filterValue,
      filterKey: view.filter_key,
      limit: isCompact ? 5 : 500,
      definition: view.definition,
      mappings: mappings
    });
    
    setData(result);
  };

  useEffect(() => {
    loadData();
  }, [view, filterValue, mappings]);

  // 3. Manejo de registros (Crear/Eliminar)
  const handleDelete = async (recordId: string) => {
    if (!confirm('¿Eliminar este registro?')) return;
    try {
      const res = await fetch('/api/views/records', { 
        method: 'POST', 
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${session?.access_token}` 
        }, 
        body: JSON.stringify({ action: 'delete', recordId, viewId: view?.id === 'temp' ? null : view?.id }) 
      });
      if (res.ok) setData(prev => prev.filter(r => r.id !== recordId));
    } catch (err) {
      console.error('Error deleting record:', err);
    }
  };

  const handleSaveNew = async () => {
    if (!view?.entity_id) return;
    setIsSaving(true);
    try {
      const finalData = { ...newRow };
      // Si hay un filtro activo, asegurar que el nuevo registro lo incluya
      const filterKey = view.filter_key || detectCwpColumn(view.columns || []);
      if (filterKey && filterValue) finalData[filterKey] = filterValue;

      const res = await fetch('/api/views/records', { 
        method: 'POST', 
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${session?.access_token}` 
        }, 
        body: JSON.stringify({ 
          action: 'create', 
          entityId: view.entity_id, 
          viewId: view.id === 'temp' ? null : view.id, 
          data: finalData 
        }) 
      });
      
      if (res.ok) { 
        loadData(); 
        setNewRow({}); 
        setIsAdding(false); 
      }
    } catch (err) {
      console.error('Error saving record:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!view?.entity_id) {
    return (
      <div className="p-8 bg-white rounded-[2rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-center space-y-4">
        <Database size={24} className="text-slate-200" />
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Configurar Vista: {viewName}</p>
          <select 
            className="mt-2 w-full p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-bold outline-none focus:border-brand-electric transition-all" 
            onChange={e => setSelectedEntityId(e.target.value)} 
            value={selectedEntityId || ''}
          >
            <option value="">Seleccionar tabla...</option>
            {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      </div>
    );
  }

  const displayColumns = view.columns || [];

  return (
    <div className={isCompact ? '' : 'space-y-4'}>
      <div className={`flex justify-between items-center ${isCompact ? 'px-1 mb-2' : 'px-2'}`}>
        <div>
          {title && <h4 className={`${isCompact ? 'text-[10px]' : 'text-sm'} font-black text-slate-800 italic tracking-tight uppercase`}>{title}</h4>}
          <p className={`${isCompact ? 'text-[7px]' : 'text-[9px]'} font-black text-slate-400 uppercase tracking-widest mt-0.5`}>
            {data.length} registros{filterValue ? ` • Filtro: ${filterValue}` : ''}
          </p>
        </div>
        {!isAdding && !isCompact && (
          <button 
            onClick={() => setIsAdding(true)} 
            className="px-3 py-1.5 bg-brand-deep text-white rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 hover:bg-brand-electric transition-all shadow-sm border border-white/10"
          >
            <Plus size={11} /> Agregar
          </button>
        )}
      </div>

      {isAdding && (
        <div className="bg-slate-50 p-5 rounded-[1.5rem] border border-slate-100 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayColumns.filter((c: string) => !c.startsWith('JOIN::')).map((col: string) => (
              <div key={col}>
                <label className="block text-[8px] uppercase font-black text-slate-400 mb-1 tracking-widest">{col}</label>
                <input 
                  type="text" 
                  value={newRow[col] || ''} 
                  onChange={e => setNewRow({ ...newRow, [col]: e.target.value })} 
                  className="w-full text-[10px] p-2 bg-white border border-slate-100 rounded-lg outline-none focus:border-brand-electric transition-all" 
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setIsAdding(false)} className="px-3 py-1.5 text-slate-400 font-black text-[9px] uppercase">Cancelar</button>
            <button 
              onClick={handleSaveNew} 
              className="px-5 py-1.5 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase disabled:opacity-50" 
              disabled={isSaving}
            >
              {isSaving ? '...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      <div className={`overflow-x-auto ${isCompact ? 'rounded-lg border border-slate-50' : 'rounded-2xl border border-slate-100 bg-white shadow-sm'} overflow-hidden`}>
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50/50 grayscale opacity-70">
            <tr>
              {displayColumns.map((col: string) => {
                const label = col.startsWith('JOIN::') ? col.split('::')[2] : col;
                return (
                  <th key={col} className="px-4 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    {label}
                  </th>
                );
              })}
              {!isCompact && <th className="px-4 py-3 border-b border-slate-100" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr>
                <td colSpan={100} className="py-12 text-center text-slate-300 text-[10px] items-center gap-2">
                  <Loader2 className="animate-spin inline mr-2" size={14} /> Cargando...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={100} className="py-12 text-center text-slate-300 text-[9px] font-bold italic">
                  Sin resultados para este filtro.
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80 group transition-all">
                  {displayColumns.map((col: string) => (
                    <td key={col} className="px-4 py-2.5 text-[10px] text-slate-600 font-medium">
                      <span className="truncate block max-w-[150px]">{row[col] ?? '—'}</span>
                    </td>
                  ))}
                  {!isCompact && (
                    <td className="px-4 py-2.5 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleDelete(row.id)} className="p-1.5 text-slate-300 hover:text-red-400 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
