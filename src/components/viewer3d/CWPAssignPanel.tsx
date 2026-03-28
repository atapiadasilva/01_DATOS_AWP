'use client';

import React, { useState, useMemo } from 'react';
import { X, Tag, Search, Check, Loader2, Trash2 } from 'lucide-react';

export interface SelectedElement {
  dbId:        number;
  externalId:  string;
  name:        string;
  category:    string;
  currentCwp?: string;
}

interface CWPOption {
  cwp_code:        string;
  cwp_description: string;
  discipline:      string;
}

interface Props {
  elements: SelectedElement[];
  cwps:     CWPOption[];
  saving:   boolean;
  onAssign: (cwpCode: string) => void;
  onRemove: () => void;
  onClose:  () => void;
}

function hue2rgb(p: number, q: number, t: number) {
  if (t < 0) t += 1; if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}

/** Returns a deterministic #rrggbb color for a CWP code */
export function cwpHexColor(code: string): string {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = code.charCodeAt(i) + ((h << 5) - h);
  const hue = (Math.abs(h) % 360) / 360;
  const s = 0.55, l = 0.50;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, hue + 1/3) * 255);
  const g = Math.round(hue2rgb(p, q, hue)       * 255);
  const b = Math.round(hue2rgb(p, q, hue - 1/3) * 255);
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export default function CWPAssignPanel({ elements, cwps, saving, onAssign, onRemove, onClose }: Props) {
  const [query,    setQuery]    = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const currentCwps = useMemo(() =>
    Array.from(new Set(elements.map(e => e.currentCwp).filter(Boolean))) as string[],
  [elements]);

  const filtered = useMemo(() =>
    cwps.filter(c =>
      !query ||
      c.cwp_description.toLowerCase().includes(query.toLowerCase()) ||
      c.cwp_code.toLowerCase().includes(query.toLowerCase()) ||
      c.discipline.toLowerCase().includes(query.toLowerCase())
    ),
  [cwps, query]);

  const chosenCwp = cwps.find(c => c.cwp_code === selected);

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200 w-80 shrink-0 shadow-xl">

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-brand-deep text-white shrink-0">
        <Tag className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[11px] font-black uppercase tracking-widest flex-1">Asignar a CWP</span>
        <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Selected elements */}
      <div className="px-3 py-2 border-b border-slate-100 shrink-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
          {elements.length} elemento{elements.length !== 1 ? 's' : ''} seleccionado{elements.length !== 1 ? 's' : ''}
        </p>
        <div className="max-h-16 overflow-y-auto space-y-0.5">
          {elements.map(el => (
            <div key={el.externalId} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
              <span className="text-[10px] text-slate-600 truncate flex-1">{el.name || el.externalId}</span>
              {el.currentCwp && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white shrink-0"
                  style={{ background: cwpHexColor(el.currentCwp) }}>
                  {el.currentCwp}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg px-2.5 py-1.5">
          <Search className="w-3 h-3 text-slate-400 shrink-0" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por descripción o código…"
            autoFocus
            className="bg-transparent text-[11px] flex-1 outline-none text-slate-700 placeholder:text-slate-400"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-600">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* CWP list — always visible, scrollable */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="p-4 text-xs text-slate-400 text-center">Sin resultados para "{query}"</p>
        )}
        {filtered.map(cwp => {
          const isSelected = selected === cwp.cwp_code;
          return (
            <button
              key={cwp.cwp_code}
              onClick={() => setSelected(isSelected ? null : cwp.cwp_code)}
              className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left border-b border-slate-50
                transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
            >
              {/* Color dot */}
              <span className="w-2.5 h-2.5 rounded-full mt-0.5 shrink-0"
                style={{ background: cwpHexColor(cwp.cwp_code) }} />

              {/* Description (primary) + code + discipline */}
              <div className="flex-1 min-w-0">
                <p className={`text-[12px] leading-tight font-semibold
                  ${isSelected ? 'text-blue-800' : 'text-slate-800'}`}>
                  {cwp.cwp_description || cwp.cwp_code}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[9px] font-mono font-bold text-slate-400">{cwp.cwp_code}</span>
                  {cwp.discipline && (
                    <>
                      <span className="text-slate-200">·</span>
                      <span className="text-[9px] text-slate-400">{cwp.discipline}</span>
                    </>
                  )}
                </div>
              </div>

              {isSelected && <Check className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />}
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className="px-3 py-3 border-t border-slate-100 space-y-2 shrink-0 bg-slate-50">
        {/* Selected CWP preview */}
        {chosenCwp && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border"
            style={{
              background: cwpHexColor(chosenCwp.cwp_code) + '15',
              borderColor: cwpHexColor(chosenCwp.cwp_code) + '60',
            }}>
            <span className="w-2 h-2 rounded-full shrink-0"
              style={{ background: cwpHexColor(chosenCwp.cwp_code) }} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-slate-800 truncate">{chosenCwp.cwp_description}</p>
              <p className="text-[9px] text-slate-500">{chosenCwp.cwp_code}</p>
            </div>
          </div>
        )}

        <button
          disabled={!selected || saving}
          onClick={() => selected && onAssign(selected)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-bold
            bg-brand-deep text-white hover:bg-brand-deep/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
          {saving ? 'Guardando…' : selected ? `Asignar ${elements.length} elemento${elements.length !== 1 ? 's' : ''}` : 'Selecciona un CWP'}
        </button>

        {currentCwps.length > 0 && (
          <button
            disabled={saving}
            onClick={onRemove}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-[11px] font-semibold
              border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-40 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Quitar asignación
          </button>
        )}
      </div>
    </div>
  );
}
