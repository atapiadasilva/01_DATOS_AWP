import React from 'react';
import { Search, Bell, HelpCircle, User, Globe, ChevronDown } from 'lucide-react';

export default function Topbar() {
  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-5 z-20 sticky top-0 shadow-sm">
      {/* ── Brand ── */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className="w-8 h-8 rounded-lg bg-[#1E3A8A] flex items-center justify-center shadow-md shadow-[#1E3A8A]/30 shrink-0">
            <span className="text-white text-[11px] font-black tracking-tighter select-none">AG</span>
          </div>

          {/* Brand name + product badge */}
          <div className="flex items-center gap-2">
            <span className="text-[#0F2544] font-black text-[17px] tracking-tight leading-none select-none">
              Antigravity
            </span>
            <span className="px-2 py-0.5 bg-[#F5C518] text-[#0F2544] text-[8px] font-black rounded-full uppercase tracking-widest select-none leading-none pt-1">
              nano banana
            </span>
          </div>
        </div>

        {/* Project selector */}
        <button className="flex items-center gap-1.5 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-600 border border-transparent hover:border-slate-200 transition-all ml-2">
          <span>Proyecto AWP</span>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* ── Right controls ── */}
      <div className="flex items-center gap-2">
        <div className="relative flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar..."
            className="w-56 pl-9 pr-4 py-1.5 bg-slate-100 border border-transparent rounded-full text-sm focus:ring-2 focus:bg-white focus:ring-[#1E3A8A]/20 focus:border-[#1E3A8A] transition-all outline-none"
          />
        </div>

        <div className="flex items-center gap-0.5 ml-2">
          <button className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
            <Bell className="w-5 h-5" />
          </button>
          <button className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
            <HelpCircle className="w-5 h-5" />
          </button>
          <button className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <div className="w-7 h-7 bg-[#1E3A8A] rounded-full flex items-center justify-center text-white shadow-sm">
              <User className="w-4 h-4" />
            </div>
          </button>
          <button className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
            <Globe className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
