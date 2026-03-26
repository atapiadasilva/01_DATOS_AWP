'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  X, Printer, Type, AlignLeft, AlignCenter, AlignRight,
  Image as ImageIcon, Minus, ChevronUp, ChevronDown,
  Trash2, BarChart3, Table2, FileText, Maximize2, Bold,
  Italic, Wand2, Loader2, RefreshCw, Eye, Download
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
type SectionType = 'header' | 'text' | 'image' | 'divider' | 'metrics' | 'spacer' | 'twoCol' | 'viewtable' | 'activitytable' | 'photosummary' | 'pagebreak';
type Align = 'left' | 'center' | 'right';
type FontSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl';

interface Section {
  id: string;
  type: SectionType;
  content: string;
  subtitle?: string;
  fontSize?: FontSize;
  align?: Align;
  bold?: boolean;
  italic?: boolean;
  imageUrl?: string;
  imageHeight?: number;
  colB?: string;
  viewId?: string;         // for viewtable blocks
  viewName?: string;       // display name
  maxRows?: number;
}

interface CWPReportEditorProps {
  cwp: any;
  hhData?: { totalHH: number; doneHH: number; pct: number; tasks: any[] } | null;
  customViews?: any[];
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const FONT_SIZES: Record<FontSize, string> = {
  xs: 'text-xs', sm: 'text-sm', base: 'text-base',
  lg: 'text-lg', xl: 'text-xl', '2xl': 'text-2xl',
};
const newId = () => Math.random().toString(36).slice(2, 9);

const SECTION_PRESETS: { type: SectionType; icon: any; label: string }[] = [
  { type: 'header',         icon: Type,       label: 'Encabezado'      },
  { type: 'text',           icon: AlignLeft,  label: 'Párrafo'         },
  { type: 'twoCol',         icon: Table2,     label: 'Dos columnas'    },
  { type: 'image',          icon: ImageIcon,  label: 'Imagen'          },
  { type: 'metrics',        icon: BarChart3,  label: 'Métricas CWP'    },
  { type: 'activitytable',  icon: Table2,     label: 'Tabla Actividades'},
  { type: 'viewtable',      icon: Eye,        label: 'Tabla de Vista'  },
  { type: 'photosummary',   icon: ImageIcon,  label: 'Resumen Fotos'   },
  { type: 'divider',        icon: Minus,      label: 'Separador'       },
  { type: 'spacer',         icon: Maximize2,  label: 'Espacio'         },
  { type: 'pagebreak',      icon: FileText,   label: 'Salto de Página' },
];

// ─── ViewTable sub-component ──────────────────────────────────────────────────
function ViewTableBlock({ section, cwpName, onUpdate, isEditing }: {
  section: Section; cwpName: string;
  onUpdate: (updates: Partial<Section>) => void;
  isEditing: boolean;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!section.viewId) return;
    loadData();
  }, [section.viewId, cwpName]);

  const loadData = async () => {
    if (!section.viewId) return;
    setLoading(true);
    try {
      const { data: viewData } = await supabase
        .from('custom_views').select('*').eq('id', section.viewId).single();
      if (!viewData) return;

      let query = supabase.from('data_records').select('*').eq('entity_id', viewData.entity_id);
      const val = cwpName.replace(/[()]/g, '').trim();
      if (val && viewData.filter_key) {
        query = query.filter(`data->>${viewData.filter_key}`, 'ilike', `%${val}%`);
      }
      const { data: records } = await query.limit(section.maxRows || 20);
      if (records && records.length > 0) {
        const dataRows = records.map(r => r.data || {});
        const allCols = viewData.columns || Object.keys(dataRows[0]).slice(0, 8);
        setCols(allCols);
        setRows(dataRows);
      } else {
        setRows([]); setCols([]);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (!section.viewId) {
    return (
      <div className="border-2 border-dashed border-brand-cloud rounded-xl p-6 text-center">
        <Eye size={20} className="mx-auto text-slate-200 mb-2" />
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {isEditing ? 'Selecciona una vista en el panel izquierdo' : 'Vista no configurada'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-black text-brand-slate/40 uppercase tracking-widest">{section.viewName || 'Vista de datos'}</p>
        <div className="flex items-center gap-2">
          {loading && <Loader2 size={10} className="animate-spin text-brand-electric" />}
          <span className="text-[9px] text-slate-300 font-bold">{rows.length} registros</span>
        </div>
      </div>
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-brand-cloud">
          <table className="w-full text-left border-collapse">
            <thead className="bg-brand-deep text-white">
              <tr>{cols.map(c => <th key={c} className="px-3 py-2 text-[8px] font-black uppercase tracking-widest">{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-brand-cloud">
              {rows.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-brand-cloud/20'}>
                  {cols.map(c => (
                    <td key={c} className="px-3 py-2 text-[9px] text-slate-600 max-w-[120px]">
                      <span className="truncate block">{row[c] ?? '—'}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[10px] text-slate-300 font-bold text-center py-4">
          {loading ? 'Cargando...' : 'Sin datos para este CWP'}
        </p>
      )}
    </div>
  );
}

// ─── PhotoSummary sub-component ───────────────────────────────────────────────
function PhotoSummaryBlock({ cwpName }: { cwpName: string }) {
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('cwp_photos').select('*').eq('cwp_name', cwpName)
      .order('date', { ascending: false }).limit(6)
      .then(({ data }) => { if (data) setPhotos(data); setLoading(false); });
  }, [cwpName]);

  if (loading) return <div className="flex items-center justify-center py-4"><Loader2 size={16} className="animate-spin text-brand-electric" /></div>;
  if (!photos.length) return (
    <div className="text-center py-4 opacity-30">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sin fotos registradas</p>
    </div>
  );

  // Group by date
  const byDate = photos.reduce<Record<string, any[]>>((acc, p) => {
    if (!acc[p.date]) acc[p.date] = [];
    acc[p.date].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-black text-brand-slate/40 uppercase tracking-widest">Evidencia fotográfica ({photos.length} fotos)</p>
      </div>
      {Object.entries(byDate).map(([date, datePhotos]) => (
        <div key={date} className="space-y-2">
          <p className="text-[9px] font-bold text-brand-slate/40">
            {new Date(date + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {datePhotos.map((p: any) => (
              <div key={p.id} className="aspect-square rounded-xl overflow-hidden">
                <img src={p.url} alt={p.description || p.area} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CWPReportEditor({ cwp, hhData, customViews = [], onClose }: CWPReportEditorProps) {
  const [layout, setLayout]           = useState<'portrait' | 'landscape'>('portrait');
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [sections, setSections]       = useState<Section[]>([]);
  const [isAutoGen, setIsAutoGen]     = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef                  = useRef<HTMLInputElement>(null);

  // cwpViews = only views with filter_key
  const cwpViews = customViews.filter(v => v.filter_key);

  // ── Initialize with defaults ──
  useEffect(() => {
    setSections([
      { id: newId(), type: 'header', content: cwp.displayName || cwp.name, subtitle: `${cwp.discipline} — ${cwp.name}`, fontSize: '2xl', align: 'left' },
      { id: newId(), type: 'metrics', content: '' },
      { id: newId(), type: 'divider', content: '' },
      { id: newId(), type: 'text', content: 'Descripción del alcance del CWP. Incluye los trabajos a ejecutar, los límites de batería y las consideraciones especiales del área.', fontSize: 'sm', align: 'left' },
    ]);
  }, []);

  // ── Auto-generate ──
  const autoGenerate = async () => {
    setIsAutoGen(true);
    await new Promise(r => setTimeout(r, 300));

    const generated: Section[] = [
      // Title block
      { id: newId(), type: 'header', content: cwp.displayName || cwp.name, subtitle: `${cwp.discipline} — ${cwp.name} · ${new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}`, fontSize: '2xl', align: 'left' },
      // Metrics
      { id: newId(), type: 'metrics', content: '' },
      { id: newId(), type: 'divider', content: '' },
    ];

    // HH activities table
    if (hhData && hhData.tasks.length > 0) {
      generated.push({
        id: newId(), type: 'activitytable', content: '',
        subtitle: `${hhData.tasks.length} actividades vinculadas`,
      });
      generated.push({ id: newId(), type: 'divider', content: '' });
    }

    // View tables
    if (cwpViews.length > 0) {
      for (const view of cwpViews.slice(0, 3)) {
        generated.push({
          id: newId(), type: 'viewtable', content: '',
          viewId: view.id, viewName: view.name, maxRows: 15,
        });
        generated.push({ id: newId(), type: 'spacer', content: '' });
      }
    }

    // Photo evidence
    generated.push({ id: newId(), type: 'photosummary', content: '' });
    generated.push({ id: newId(), type: 'divider', content: '' });

    // Notes / observations placeholder
    generated.push({
      id: newId(), type: 'twoCol', content: 'Observaciones y pendientes del período:\n\n• \n• \n• ',
      colB: 'Próximas acciones:\n\n• \n• \n• ', fontSize: 'sm', align: 'left',
    });

    setSections(generated);
    setIsAutoGen(false);
  };

  // ── Section CRUD ──
  const addSection = (type: SectionType) => {
    const s: Section = {
      id: newId(), type, content: type === 'text' ? 'Escribe el contenido aquí...' : type === 'header' ? 'Nuevo Título' : type === 'twoCol' ? 'Columna izquierda' : '',
      colB: type === 'twoCol' ? 'Columna derecha' : undefined,
      fontSize: type === 'header' ? 'xl' : 'sm', align: 'left', imageHeight: 320, maxRows: 20,
    };
    setSections(prev => [...prev, s]);
    setEditingId(s.id);
  };

  const removeSection  = (id: string) => { setSections(prev => prev.filter(s => s.id !== id)); if (editingId === id) setEditingId(null); };
  const updateSection  = (id: string, up: Partial<Section>) => setSections(prev => prev.map(s => s.id === id ? { ...s, ...up } : s));
  const moveSection    = (id: string, dir: 'up' | 'down') => {
    setSections(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (dir === 'up' && idx === 0) return prev;
      if (dir === 'down' && idx === prev.length - 1) return prev;
      const arr = [...prev];
      const [rm] = arr.splice(idx, 1);
      arr.splice(dir === 'up' ? idx - 1 : idx + 1, 0, rm);
      return arr;
    });
  };

  const handleImageFile = (sectionId: string, file: File) => {
    updateSection(sectionId, { imageUrl: URL.createObjectURL(file) });
    setUploadingId(null);
  };

  // ── Render section ──
  const renderSection = (s: Section, isEditing: boolean) => {
    const alignCls  = s.align === 'center' ? 'text-center' : s.align === 'right' ? 'text-right' : 'text-left';
    const fontCls   = FONT_SIZES[s.fontSize || 'base'];
    const styleCls  = `${s.bold ? 'font-bold' : ''} ${s.italic ? 'italic' : ''}`.trim();

    switch (s.type) {
      // ─ Header ─
      case 'header': return (
        <div className={alignCls}>
          {isEditing ? (
            <div className="space-y-2">
              <input value={s.content} onChange={e => updateSection(s.id, { content: e.target.value })}
                className="w-full text-2xl font-black bg-transparent border-b-2 border-brand-electric outline-none placeholder-slate-200"
                placeholder="Título principal..." />
              <input value={s.subtitle || ''} onChange={e => updateSection(s.id, { subtitle: e.target.value })}
                className="w-full text-sm font-bold bg-transparent border-b border-slate-100 outline-none text-slate-500 placeholder-slate-200"
                placeholder="Subtítulo..." />
            </div>
          ) : (
            <>
              <h1 className={`${FONT_SIZES[s.fontSize || '2xl']} font-black text-brand-deep leading-tight`}>{s.content}</h1>
              {s.subtitle && <p className="text-sm font-bold text-brand-slate/50 mt-1">{s.subtitle}</p>}
            </>
          )}
        </div>
      );

      // ─ Text ─
      case 'text': return (
        <div className={alignCls}>
          {isEditing
            ? <textarea value={s.content} onChange={e => updateSection(s.id, { content: e.target.value })}
                rows={5} className={`w-full ${fontCls} bg-transparent border border-brand-cloud rounded-xl p-3 outline-none focus:border-brand-electric resize-y`} />
            : <p className={`${fontCls} text-slate-700 whitespace-pre-wrap leading-relaxed ${styleCls}`}>{s.content}</p>}
        </div>
      );

      // ─ Two columns ─
      case 'twoCol': return (
        <div className="grid grid-cols-2 gap-6">
          <div className="border-l-2 border-brand-electric pl-4">
            {isEditing
              ? <textarea value={s.content} onChange={e => updateSection(s.id, { content: e.target.value })}
                  rows={4} className={`w-full ${fontCls} bg-transparent border border-brand-cloud rounded-xl p-3 outline-none focus:border-brand-electric resize-y`} />
              : <p className={`${fontCls} text-slate-700 whitespace-pre-wrap leading-relaxed ${styleCls}`}>{s.content}</p>}
          </div>
          <div className="border-l-2 border-brand-deep/20 pl-4">
            {isEditing
              ? <textarea value={s.colB || ''} onChange={e => updateSection(s.id, { colB: e.target.value })}
                  rows={4} className={`w-full ${fontCls} bg-transparent border border-brand-cloud rounded-xl p-3 outline-none focus:border-brand-electric resize-y`} />
              : <p className={`${fontCls} text-slate-700 whitespace-pre-wrap leading-relaxed ${styleCls}`}>{s.colB}</p>}
          </div>
        </div>
      );

      // ─ Image ─
      case 'image': return (
        <div className={`${alignCls}`}>
          {s.imageUrl ? (
            <div className="relative group/img select-none">
              <img
                src={s.imageUrl} alt=""
                className="w-full object-contain rounded-2xl shadow-md"
                style={{ height: `${s.imageHeight || 320}px`, objectFit: 'cover' }}
                draggable={false}
              />
              {/* Overlay buttons */}
              {isEditing && (
                <div className="absolute inset-0 bg-brand-deep/20 opacity-0 group-hover/img:opacity-100 rounded-2xl flex items-center justify-center gap-3 transition-opacity">
                  <button onClick={() => { setUploadingId(s.id); fileInputRef.current?.click(); }}
                    className="px-4 py-2 bg-white text-brand-deep rounded-xl text-[10px] font-black uppercase shadow-lg">Cambiar</button>
                  <button onClick={() => updateSection(s.id, { imageUrl: undefined })}
                    className="px-4 py-2 bg-red-500 text-white rounded-xl text-[10px] font-black uppercase shadow-lg">Quitar</button>
                </div>
              )}
              {/* Drag-resize handle */}
              {isEditing && (
                <div
                  onMouseDown={e => startImageResize(e, s.id, s.imageHeight || 320)}
                  className="absolute bottom-0 left-0 right-0 h-4 flex items-center justify-center cursor-ns-resize group/drag z-10 print-hidden"
                  title="Arrastra para cambiar el alto"
                >
                  <div className="w-16 h-1.5 bg-brand-electric/60 rounded-full group-hover/drag:bg-brand-electric transition-colors" />
                </div>
              )}
              {/* Height indicator */}
              {isEditing && (
                <div className="absolute top-2 right-2 bg-black/40 text-white text-[9px] font-black px-2 py-0.5 rounded-lg print-hidden">
                  {s.imageHeight || 320}px
                </div>
              )}
            </div>
          ) : (
            <div onClick={() => { setUploadingId(s.id); fileInputRef.current?.click(); }}
              className="border-2 border-dashed border-brand-cloud hover:border-brand-electric rounded-[1.5rem] p-12 flex flex-col items-center gap-3 cursor-pointer transition-all group/drop">
              <ImageIcon size={28} className="text-slate-200 group-hover/drop:text-brand-electric transition-colors" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Click para subir imagen</p>
            </div>
          )}
        </div>
      );

      // ─ Metrics ─
      case 'metrics': return (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-brand-deep/5 border border-brand-deep/10 rounded-2xl p-4">
              <p className="text-[8px] font-black text-brand-slate/40 uppercase tracking-widest">Disciplina</p>
              <p className="text-base font-black text-brand-deep mt-1 leading-tight">{cwp.discipline}</p>
            </div>
            <div className="bg-brand-electric/5 border border-brand-electric/20 rounded-2xl p-4">
              <p className="text-[8px] font-black text-brand-slate/40 uppercase tracking-widest">Actividades</p>
              <p className="text-base font-black text-brand-electric mt-1">{cwp.activities}</p>
            </div>
            <div className={`${hhData ? 'bg-brand-orange/5 border-brand-orange/20' : 'bg-slate-50 border-slate-100'} border rounded-2xl p-4`}>
              <p className="text-[8px] font-black text-brand-slate/40 uppercase tracking-widest">{hhData ? 'Avance' : 'HH Base'}</p>
              <p className="text-base font-black text-brand-orange mt-1">
                {hhData ? `${hhData.pct.toFixed(1)}%` : `${(cwp.hh||0).toLocaleString('es-CL',{maximumFractionDigits:0})} h`}
              </p>
            </div>
          </div>
          {hhData && (
            <div className="bg-white border border-brand-cloud rounded-2xl p-4">
              <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-brand-slate/40 mb-1.5">
                <span>Avance global</span><span className="text-brand-electric">{hhData.pct.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-brand-cloud rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-brand-electric to-brand-deep rounded-full" style={{ width: `${hhData.pct}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                {[
                  { l: 'HH Total',    v: `${hhData.totalHH.toLocaleString('es-CL',{maximumFractionDigits:0})} h`, c: 'text-brand-deep' },
                  { l: 'Ejecutadas',  v: `${hhData.doneHH.toLocaleString('es-CL',{maximumFractionDigits:0})} h`, c: 'text-brand-electric' },
                  { l: 'Restantes',   v: `${(hhData.totalHH-hhData.doneHH).toLocaleString('es-CL',{maximumFractionDigits:0})} h`, c: 'text-brand-orange' },
                ].map(m => (
                  <div key={m.l} className="text-center">
                    <p className="text-[8px] font-black text-brand-slate/40 uppercase tracking-widest">{m.l}</p>
                    <p className={`text-sm font-black mt-0.5 ${m.c}`}>{m.v}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );

      // ─ Activity table ─
      case 'activitytable': {
        if (!hhData || !hhData.tasks.length) return (
          <div className="text-center py-4 opacity-30">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sin actividades vinculadas en el programa</p>
          </div>
        );
        return (
          <div className="space-y-2">
            <p className="text-[9px] font-black text-brand-slate/40 uppercase tracking-widest">Actividades del Programa — {hhData.tasks.length} tareas</p>
            <div className="overflow-hidden rounded-xl border border-brand-cloud">
              <table className="w-full text-left border-collapse">
                <thead className="bg-brand-deep text-white">
                  <tr>
                    <th className="px-3 py-2 text-[8px] font-black uppercase tracking-widest">EDT</th>
                    <th className="px-3 py-2 text-[8px] font-black uppercase tracking-widest">Actividad</th>
                    <th className="px-3 py-2 text-[8px] font-black uppercase tracking-widest text-right">HH</th>
                    <th className="px-3 py-2 text-[8px] font-black uppercase tracking-widest">Avance</th>
                    <th className="px-3 py-2 text-[8px] font-black uppercase tracking-widest">Inicio</th>
                    <th className="px-3 py-2 text-[8px] font-black uppercase tracking-widest">Fin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-cloud">
                  {hhData.tasks.map((t: any, i: number) => (
                    <tr key={t.edt} className={i % 2 === 0 ? 'bg-white' : 'bg-brand-cloud/20'}>
                      <td className="px-3 py-1.5 text-[8px] font-black text-brand-deep/60">{t.edt}</td>
                      <td className="px-3 py-1.5 text-[9px] text-slate-700 max-w-[180px]"><span className="line-clamp-1">{t.name}</span></td>
                      <td className="px-3 py-1.5 text-[9px] font-black text-brand-deep text-right">{t.hh > 0 ? `${t.hh.toLocaleString('es-CL',{maximumFractionDigits:0})} h` : '—'}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5 min-w-[80px]">
                          <div className="flex-1 h-1.5 bg-brand-cloud rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${t.pct===100?'bg-brand-deep':t.pct>0?'bg-brand-electric':'bg-slate-200'}`} style={{width:`${t.pct}%`}} />
                          </div>
                          <span className="text-[8px] font-black text-brand-slate/50 w-6 text-right">{t.pct}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-[8px] text-slate-400">{t.aStart || '—'}</td>
                      <td className="px-3 py-1.5 text-[8px] text-slate-400">{t.aEnd || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      // ─ View table ─
      case 'viewtable': return (
        <ViewTableBlock section={s} cwpName={cwp.name} onUpdate={u => updateSection(s.id, u)} isEditing={isEditing} />
      );

      // ─ Photo summary ─
      case 'photosummary': return <PhotoSummaryBlock cwpName={cwp.name} />;

      case 'divider': return <div className="h-px bg-brand-cloud rounded-full" />;
      case 'spacer':  return <div style={{ height: '24px' }} />;
      case 'pagebreak': return (
        <div className="page-break-section flex items-center gap-3 py-2 print-hidden">
          <div className="flex-1 border-t-2 border-dashed border-red-300" />
          <span className="text-[9px] font-black text-red-400 uppercase tracking-widest bg-red-50 px-3 py-1 rounded-full border border-red-200 shrink-0">
            ✂ Salto de página
          </span>
          <div className="flex-1 border-t-2 border-dashed border-red-300" />
        </div>
      );

      default: return null;
    }
  };

  // US Letter: 215.9mm × 279.4mm   portrait  = 816px × 1056px @ 96dpi
  //            279.4mm × 215.9mm   landscape = 1056px × 816px @ 96dpi
  const PAGE_W_MM  = layout === 'landscape' ? 279.4 : 215.9;
  const PAGE_H_MM  = layout === 'landscape' ? 215.9 : 279.4;
  const PAGE_H_PX  = layout === 'landscape' ? 816 : 1056;  // for guide line
  const pageStyle  = layout === 'landscape'
    ? 'w-[279.4mm] min-h-[215.9mm]'
    : 'w-[215.9mm] min-h-[279.4mm]';

  const editingSec = sections.find(s => s.id === editingId);
  const editableTypes: SectionType[] = ['text', 'header', 'twoCol'];

  // ── Image resize drag ──
  const startImageResize = (e: React.MouseEvent, sectionId: string, currentH: number) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const onMove = (me: MouseEvent) => {
      const newH = Math.max(60, currentH + (me.clientY - startY));
      updateSection(sectionId, { imageHeight: newH });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <>
      <style>{`
        @media print {
          body > * { display: none !important; }
          #cwp-report-canvas { display: block !important; position: fixed !important; top: 0; left: 0; width: 100%; padding: 15mm; }
          .print-hidden { display: none !important; }
          .page-break-section { page-break-after: always !important; }
          #cwp-report-canvas { background-image: none !important; border-radius: 0 !important; box-shadow: none !important; }
          @page { size: ${PAGE_W_MM}mm ${PAGE_H_MM}mm; margin: 18mm; }
        }
      `}</style>

      <div className="fixed inset-0 z-[150] bg-slate-100 flex flex-col">

        {/* ── Toolbar ── */}
        <div className="h-14 bg-brand-deep flex items-center px-5 gap-3 shrink-0 print-hidden">
          <button onClick={onClose} className="p-2 bg-white/10 rounded-xl text-white hover:bg-white/20 transition-all">
            <X size={16} />
          </button>
          <div className="h-5 w-px bg-white/10" />
          <div>
            <p className="text-sm font-black text-white italic leading-tight">{cwp.displayName || cwp.name}</p>
            <p className="text-[9px] text-white/40 font-black uppercase tracking-widest">Editor de Reporte</p>
          </div>

          {/* Auto-generate */}
          <button
            onClick={autoGenerate}
            disabled={isAutoGen}
            className="ml-2 flex items-center gap-2 px-4 py-2 bg-brand-orange/20 text-brand-orange border border-brand-orange/30 rounded-xl text-[10px] font-black uppercase hover:bg-brand-orange/30 transition-all disabled:opacity-50"
          >
            {isAutoGen ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
            Auto-generar
          </button>

          <div className="ml-auto flex items-center gap-3">
            {/* Layout toggle */}
            <div className="flex bg-white/10 rounded-xl p-1 gap-0.5">
              {(['portrait', 'landscape'] as const).map(l => (
                <button key={l} onClick={() => setLayout(l)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${layout === l ? 'bg-white text-brand-deep shadow' : 'text-white/60 hover:text-white'}`}>
                  {l === 'portrait' ? '▯ Vertical' : '▭ Horizontal'}
                </button>
              ))}
            </div>
            <button onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-brand-electric text-brand-deep rounded-xl text-[10px] font-black uppercase hover:opacity-80 transition-all shadow">
              <Printer size={12} /> Imprimir / PDF
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-hidden flex">

          {/* Left panel */}
          <div className="w-52 bg-white border-r border-brand-cloud flex flex-col shrink-0 print-hidden">
            <div className="p-3 border-b border-brand-cloud">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Agregar bloque</p>
            </div>
            <div className="p-2 space-y-0.5 overflow-y-auto flex-1">
              {SECTION_PRESETS.map(({ type, icon: Icon, label }) => (
                <button key={type} onClick={() => addSection(type)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-brand-cloud text-[10px] font-black text-slate-600 uppercase tracking-widest transition-all group">
                  <div className="w-5 h-5 rounded-lg bg-brand-cloud flex items-center justify-center group-hover:bg-brand-electric/10 transition-colors shrink-0">
                    <Icon size={10} className="text-brand-electric" />
                  </div>
                  {label}
                </button>
              ))}
            </div>

            {/* Format panel (only for editable text sections) */}
            {editingSec && editableTypes.includes(editingSec.type) && (
              <div className="p-3 border-t border-brand-cloud space-y-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Formato</p>
                {/* Font size */}
                <div>
                  <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">Tamaño</p>
                  <div className="grid grid-cols-3 gap-1">
                    {(['xs','sm','base','lg','xl','2xl'] as FontSize[]).map(size => (
                      <button key={size} onClick={() => updateSection(editingId!, { fontSize: size })}
                        className={`py-0.5 rounded-lg text-[9px] font-black uppercase transition-all ${editingSec.fontSize === size ? 'bg-brand-deep text-white' : 'bg-brand-cloud text-slate-500 hover:bg-brand-deep/10'}`}>
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Align */}
                <div className="flex gap-1">
                  {([['left',AlignLeft],['center',AlignCenter],['right',AlignRight]] as [Align,any][]).map(([a, Icon]) => (
                    <button key={a} onClick={() => updateSection(editingId!, { align: a })}
                      className={`flex-1 py-1.5 rounded-lg flex items-center justify-center transition-all ${editingSec.align===a?'bg-brand-deep text-white':'bg-brand-cloud text-slate-500 hover:bg-brand-deep/10'}`}>
                      <Icon size={10} />
                    </button>
                  ))}
                </div>
                {/* Bold/Italic */}
                {editingSec.type === 'text' && (
                  <div className="flex gap-1">
                    <button onClick={() => updateSection(editingId!, { bold: !editingSec.bold })}
                      className={`flex-1 py-1.5 rounded-lg flex items-center justify-center transition-all ${editingSec.bold?'bg-brand-deep text-white':'bg-brand-cloud text-slate-500 hover:bg-brand-deep/10'}`}>
                      <Bold size={10} />
                    </button>
                    <button onClick={() => updateSection(editingId!, { italic: !editingSec.italic })}
                      className={`flex-1 py-1.5 rounded-lg flex items-center justify-center transition-all ${editingSec.italic?'bg-brand-deep text-white':'bg-brand-cloud text-slate-500 hover:bg-brand-deep/10'}`}>
                      <Italic size={10} />
                    </button>
                  </div>
                )}
                <button onClick={() => setEditingId(null)}
                  className="w-full py-1 rounded-lg bg-brand-electric/10 text-brand-electric text-[9px] font-black uppercase hover:bg-brand-electric/20 transition-colors">
                  Listo ✓
                </button>
              </div>
            )}

            {/* View selector for viewtable blocks */}
            {editingSec?.type === 'viewtable' && (
              <div className="p-3 border-t border-brand-cloud space-y-2">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Vista de datos</p>
                {cwpViews.length === 0 ? (
                  <p className="text-[9px] text-slate-300 font-bold">No hay vistas con filtro CWP configurado</p>
                ) : (
                  cwpViews.map(v => (
                    <button key={v.id}
                      onClick={() => updateSection(editingId!, { viewId: v.id, viewName: v.name })}
                      className={`w-full text-left px-3 py-2 rounded-xl text-[10px] font-black transition-all ${editingSec.viewId===v.id?'bg-brand-deep text-white':'bg-brand-cloud text-slate-600 hover:bg-brand-deep/10'}`}>
                      {v.name}
                    </button>
                  ))
                )}
                <div>
                  <label className="text-[8px] font-black text-slate-300 uppercase tracking-widest block mb-1">Máx. filas</label>
                  <input type="number" value={editingSec.maxRows || 20}
                    onChange={e => updateSection(editingId!, { maxRows: parseInt(e.target.value) || 20 })}
                    className="w-full p-1.5 bg-brand-cloud border border-white/50 rounded-lg text-xs font-bold outline-none focus:border-brand-electric" />
                </div>
                <button onClick={() => setEditingId(null)}
                  className="w-full py-1 rounded-lg bg-brand-electric/10 text-brand-electric text-[9px] font-black uppercase hover:bg-brand-electric/20 transition-colors">
                  Listo ✓
                </button>
              </div>
            )}
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-y-auto p-8 flex justify-center">
            <div id="cwp-report-canvas"
              className={`bg-white shadow-2xl ${pageStyle} p-12 space-y-5 relative`}
              style={{
                borderRadius: '1.5rem',
                // Page boundary guides every PAGE_H_PX pixels (visual only, hidden on print)
                backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${PAGE_H_PX - 2}px, rgba(239,68,68,0.15) ${PAGE_H_PX - 2}px, rgba(239,68,68,0.15) ${PAGE_H_PX}px)`,
              }}>
              {sections.map((s, idx) => (
                <div key={s.id} className="relative group/sec">
                  {/* Side controls */}
                  <div className="absolute -left-11 top-0 flex flex-col gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity print-hidden">
                    <button onClick={() => moveSection(s.id, 'up')} disabled={idx === 0}
                      className="w-7 h-7 bg-white border border-brand-cloud rounded-lg flex items-center justify-center hover:bg-brand-cloud disabled:opacity-30 shadow-sm">
                      <ChevronUp size={11} />
                    </button>
                    <button onClick={() => moveSection(s.id, 'down')} disabled={idx === sections.length - 1}
                      className="w-7 h-7 bg-white border border-brand-cloud rounded-lg flex items-center justify-center hover:bg-brand-cloud disabled:opacity-30 shadow-sm">
                      <ChevronDown size={11} />
                    </button>
                    <button onClick={() => removeSection(s.id)}
                      className="w-7 h-7 bg-white border border-red-100 text-red-400 rounded-lg flex items-center justify-center hover:bg-red-50 shadow-sm">
                      <Trash2 size={10} />
                    </button>
                  </div>

                  {/* Content */}
                  <div
                    onClick={() => editableTypes.includes(s.type) ? setEditingId(editingId === s.id ? null : s.id) : undefined}
                    className={`rounded-xl transition-all ${
                      editingId === s.id ? 'ring-2 ring-brand-electric ring-offset-2 p-2 -mx-2' :
                      editableTypes.includes(s.type) ? 'hover:ring-1 hover:ring-brand-cloud p-1 -mx-1 cursor-pointer' : ''
                    }`}>
                    {renderSection(s, editingId === s.id)}
                  </div>

                  {/* Edit hint */}
                  {editingId !== s.id && editableTypes.includes(s.type) && (
                    <span className="absolute -bottom-0.5 right-0 text-[8px] text-brand-electric font-black uppercase tracking-widest bg-brand-electric/10 px-2 py-0.5 rounded-full opacity-0 group-hover/sec:opacity-100 transition-opacity print-hidden">
                      editar
                    </span>
                  )}
                </div>
              ))}

              {sections.length === 0 && (
                <div className="flex flex-col items-center justify-center h-80 gap-5 opacity-20">
                  <FileText size={48} className="text-slate-300" />
                  <div className="text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reporte vacío</p>
                    <p className="text-[9px] text-slate-300 font-bold mt-1">Usa "Auto-generar" o agrega bloques desde el panel izquierdo</p>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="absolute bottom-5 left-12 right-12 flex items-center justify-between opacity-20">
                <span className="text-[7px] font-black text-brand-slate/50 uppercase tracking-widest">{cwp.name} · {cwp.discipline}</span>
                <span className="text-[7px] font-black text-brand-slate/50 uppercase tracking-widest">datapower4D — AWP · {new Date().toLocaleDateString('es-CL')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f && uploadingId) handleImageFile(uploadingId, f); e.target.value = ''; }} />
    </>
  );
}
