import React from 'react';
import { Menu, Search, Bell, HelpCircle, User, Globe, ChevronDown } from 'lucide-react';

export default function Topbar() {
  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-20 sticky top-0">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 text-[#7CB342] font-bold text-xl tracking-tight">
          <div className="w-8 h-8 rounded-full border-[3px] border-[#7CB342] flex items-center justify-center p-1">
             <div className="w-full h-full bg-[#7CB342] rounded-full opacity-30"></div>
          </div>
          <span>O3 Solutions</span>
        </div>
        <button className="flex items-center space-x-2 text-slate-700 hover:text-slate-900 mx-2">
          <Menu className="w-5 h-5 text-[#7CB342]" />
        </button>
        <button className="flex items-center space-x-1 hover:bg-slate-50 px-2 py-1.5 rounded text-sm font-semibold text-slate-700">
          <span>Demo Training 01</span>
          <ChevronDown className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      <div className="flex items-center space-x-3">
        <div className="relative flex items-center">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-slate-400" />
          </div>
          <input 
            type="text" 
            placeholder="Búsqueda" 
            className="w-64 pl-9 pr-4 py-1.5 bg-slate-100 border border-transparent rounded-full text-sm focus:ring-2 focus:bg-white focus:ring-[#7CB342]/50 focus:border-[#7CB342] transition-all outline-none"
          />
        </div>
        <div className="flex items-center space-x-1 ml-4 text-slate-500">
          <button className="p-2 hover:bg-slate-100 rounded-full transition-colors"><Bell className="w-5 h-5" /></button>
          <button className="p-2 hover:bg-slate-100 rounded-full transition-colors"><HelpCircle className="w-5 h-5" /></button>
          <button className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <div className="w-7 h-7 bg-[#7CB342] rounded-full flex items-center justify-center text-white">
              <User className="w-4 h-4" />
            </div>
          </button>
          <button className="p-2 hover:bg-slate-100 rounded-full transition-colors"><Globe className="w-5 h-5" /></button>
        </div>
      </div>
    </header>
  );
}
