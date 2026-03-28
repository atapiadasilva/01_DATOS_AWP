'use client';

import React, { useRef, useState } from 'react';
import { Layers, Search, X, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { cwpHexColor } from './CWPAssignPanel';

interface CWPSummaryItem {
  cwp_code:        string;
  cwp_description: string;
  discipline:      string;
  count:           number;
}

interface Props {
  items:              CWPSummaryItem[];
  activeCwp:          string | null;
  hiddenCwps:         string[];
  cwpColors:          Record<string, string>;
  onSelect:           (cwpCode: string) => void;
  onClearAll:         () => void;
  onShowAll:          () => void;
  onToggleVisibility: (cwpCode: string) => void;
  onColorChange:      (cwpCode: string, color: string) => void;
}

export default function CWPSummaryPanel({
  items, activeCwp, hiddenCwps, cwpColors,
  onSelect, onClearAll, onShowAll, onToggleVisibility, onColorChange,
}: Props) {
  const [query, setQuery] = useState('');
  const colorInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const assigned = items.filter(i => i.count > 0);
  const total    = assigned.reduce((s, i) => s + i.count, 0);

  const filtered = assigned.filter(i =>
    !query ||
    i.cwp_description.toLowerCase().includes(query.toLowerCase()) ||
    i.cwp_code.toLowerCase().includes(query.toLowerCase())
  );

  // Group by discipline
  const byDisc: Record<string, CWPSummaryItem[]> = {};
  for (const item of filtered) {
    const d = item.discipline || 'General';
    if (!byDisc[d]) byDisc[d] = [];
    byDisc[d].push(item);
  }

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (d: string) => setCollapsed(p => ({ ...p, [d]: !p[d] }));

  const hiddenSet = new Set(hiddenCwps);

  return (
    <div className="flex flex-col h-full w-60 shrink-0 bg-white border-r border-slate-200 overflow-hidden">

      {/* Header */}
      <div className="px-3 py-2.5 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Layers className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-600">
            CWPs
          </span>
        </div>
        <p className="text-[10px] text-slate-400">
          {assigned.length} con asignaciones · {total} elementos
        </p>
      </div>

      {/* Search */}
      {assigned.length > 4 && (
        <div className="px-2 py-1.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-1 bg-slate-100 rounded px-2 py-1">
            <Search className="w-3 h-3 text-slate-400 shrink-0" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar…"
              className="bg-transparent text-[10px] flex-1 outline-none text-slate-700 placeholder:text-slate-400"
            />
            {query && <button onClick={() => setQuery('')}><X className="w-3 h-3 text-slate-400" /></button>}
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {assigned.length === 0 && (
          <div className="p-4 text-center">
            <p className="text-[10px] text-slate-400">Sin asignaciones aún.</p>
            <p className="text-[9px] text-slate-300 mt-1">Selecciona elementos en el modelo y asígnalos a un CWP.</p>
          </div>
        )}

        {Object.entries(byDisc).map(([disc, discItems]) => {
          const isCollapsed = collapsed[disc];
          return (
            <div key={disc}>
              {/* Discipline header */}
              <button
                onClick={() => toggle(disc)}
                className="w-full flex items-center gap-1.5 px-2 py-1 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-100"
              >
                {isCollapsed
                  ? <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                  : <ChevronDown  className="w-3 h-3 text-slate-400 shrink-0" />}
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 truncate flex-1">
                  {disc}
                </span>
                <span className="text-[9px] text-slate-400">
                  {discItems.reduce((s, i) => s + i.count, 0)}
                </span>
              </button>

              {!isCollapsed && discItems.map(item => {
                const isActive  = activeCwp === item.cwp_code;
                const isHidden  = hiddenSet.has(item.cwp_code);
                const color     = cwpColors[item.cwp_code] ?? cwpHexColor(item.cwp_code);

                return (
                  <div
                    key={item.cwp_code}
                    className={`flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-50 transition-colors
                      ${isActive ? 'bg-blue-50' : isHidden ? 'bg-slate-50 opacity-50' : 'hover:bg-slate-50'}`}
                  >
                    {/* Color swatch — click opens color picker */}
                    <button
                      title="Cambiar color"
                      onClick={() => colorInputRefs.current[item.cwp_code]?.click()}
                      className="w-3.5 h-3.5 rounded-sm shrink-0 ring-1 ring-white shadow-sm hover:scale-110 transition-transform"
                      style={{ background: color, boxShadow: isActive ? `0 0 0 2px ${color}` : undefined }}
                    />
                    {/* Hidden color input */}
                    <input
                      type="color"
                      defaultValue={color}
                      className="sr-only"
                      ref={el => { colorInputRefs.current[item.cwp_code] = el; }}
                      onChange={e => onColorChange(item.cwp_code, e.target.value)}
                    />

                    {/* Label — click selects in viewer */}
                    <button
                      onClick={() => onSelect(item.cwp_code)}
                      title={item.cwp_description}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className={`text-[10px] leading-tight truncate
                        ${isActive ? 'font-bold text-blue-800' : 'font-medium text-slate-700'}`}>
                        {item.cwp_description || item.cwp_code}
                      </p>
                      <p className="text-[9px] text-slate-400 font-mono">{item.cwp_code}</p>
                    </button>

                    {/* Count badge */}
                    <span
                      className="text-[9px] font-black px-1.5 py-0.5 rounded-full text-white shrink-0"
                      style={{ background: color }}
                    >
                      {item.count}
                    </span>

                    {/* Eye toggle */}
                    <button
                      title={isHidden ? 'Mostrar elementos' : 'Ocultar elementos'}
                      onClick={() => onToggleVisibility(item.cwp_code)}
                      className="shrink-0 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      {isHidden
                        ? <EyeOff className="w-3 h-3" />
                        : <Eye    className="w-3 h-3" />}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {(activeCwp || hiddenCwps.length > 0) && (
        <div className="px-2 py-2 border-t border-slate-100 shrink-0 space-y-1">
          {activeCwp && (
            <button
              onClick={() => onSelect(activeCwp)}
              className="w-full text-[10px] text-blue-600 font-semibold hover:text-blue-800 transition-colors"
            >
              Mostrando: {activeCwp} — clic para deseleccionar
            </button>
          )}
          {hiddenCwps.length > 0 && (
            <button
              onClick={onShowAll}
              className="w-full flex items-center justify-center gap-1.5 text-[10px] font-semibold
                text-slate-500 hover:text-slate-800 transition-colors py-0.5"
            >
              <Eye className="w-3 h-3" />
              Mostrar todos ({hiddenCwps.length} oculto{hiddenCwps.length !== 1 ? 's' : ''})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
