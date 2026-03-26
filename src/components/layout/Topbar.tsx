import React from 'react';
import { Search, Bell, HelpCircle, User, ChevronDown, Network } from 'lucide-react';

export default function Topbar() {
  return (
    <header className="h-14 bg-white/80 backdrop-blur-xl border-b border-brand-cloud flex items-center justify-between px-5 z-20 sticky top-0 shadow-sm shadow-brand-deep/5">

      {/* ── Brand ── */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className="w-8 h-8 rounded-xl bg-brand-deep flex items-center justify-center shadow-lg shadow-brand-deep/30 shrink-0">
            <Network className="text-brand-electric" size={16} />
          </div>

          {/* Brand name */}
          <span className="text-brand-deep font-black text-[17px] tracking-tight leading-none select-none italic uppercase">
            data<span className="text-brand-electric">power</span><span className="text-brand-orange">4D</span>
          </span>
        </div>

        {/* Project selector */}
        <button className="flex items-center gap-1.5 hover:bg-brand-cloud px-3 py-1.5 rounded-lg text-sm font-semibold text-brand-slate/60 border border-transparent hover:border-brand-cloud transition-all ml-2">
          <span>Proyecto AWP</span>
          <ChevronDown className="w-4 h-4 text-brand-slate/40" />
        </button>
      </div>

      {/* ── Right controls ── */}
      <div className="flex items-center gap-2">
        <div className="relative flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-brand-slate/40 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar..."
            className="w-56 pl-9 pr-4 py-1.5 bg-brand-cloud border border-transparent rounded-full text-sm focus:ring-2 focus:bg-white focus:ring-brand-electric/20 focus:border-brand-electric transition-all outline-none text-brand-slate"
          />
        </div>

        <div className="flex items-center gap-0.5 ml-2">
          <button className="p-2 hover:bg-brand-cloud rounded-full transition-colors text-brand-slate/50">
            <Bell className="w-5 h-5" />
          </button>
          <button className="p-2 hover:bg-brand-cloud rounded-full transition-colors text-brand-slate/50">
            <HelpCircle className="w-5 h-5" />
          </button>
          <button className="p-2 hover:bg-brand-cloud rounded-full transition-colors">
            <div className="w-7 h-7 bg-brand-deep rounded-full flex items-center justify-center shadow-sm shadow-brand-deep/30">
              <User className="w-4 h-4 text-brand-electric" />
            </div>
          </button>
        </div>
      </div>
    </header>
  );
}
