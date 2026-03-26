'use client';

import React, { useState } from 'react';
import { Star, Inbox, Briefcase, Users, FileText, Calendar, FolderGit2, ChevronDown, ChevronRight, Activity, Network, CheckSquare, Search, GitMerge, ShoppingCart, LayoutGrid } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'favoritos': true,
    'gestion': true,
    'tableros': true,
    'informes': true,
    'planificacion': true,
    'ingenieria': true
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const NavItem = ({ id, label, icon: Icon, isSub = true }: { id: string, label: string, icon?: React.ElementType, isSub?: boolean }) => {
    const isActive = activeTab === id;
    return (
      <button 
        onClick={() => onTabChange(id)}
        className={`w-full flex items-center px-4 py-2 text-sm text-left transition-colors ${
          isActive 
            ? 'bg-emerald-50/50 text-[#7CB342] font-semibold border-l-4 border-[#7CB342]' 
            : 'text-slate-600 hover:bg-slate-100 border-l-4 border-transparent'
        } ${isSub ? 'pl-9' : ''}`}
      >
        {Icon && <Icon className={`w-4 h-4 mr-2 ${isActive ? 'text-[#7CB342]' : 'text-slate-400'}`} />}
        {label}
        {isActive && <Star className="w-3 h-3 ml-auto text-slate-300" />}
      </button>
    );
  };

  const NavSection = ({ id, label, icon: Icon, children }: any) => {
    const isExpanded = expandedSections[id];
    return (
      <div className="mb-1">
        <button 
          onClick={() => toggleSection(id)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <div className="flex items-center">
            <Icon className="w-4 h-4 mr-3 text-slate-700" />
            {label}
          </div>
          {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </button>
        {isExpanded && (
          <div className="mt-1 space-y-0.5">
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="w-[260px] flex-shrink-0 bg-[#F5F7F8] border-r border-slate-200 h-full flex flex-col overflow-y-auto custom-scrollbar">
      <div className="py-2 flex-1">
        <NavSection id="favoritos" label="Favoritos" icon={Star}>
          <NavItem id="tree" label="Índice Maestro AWP" icon={GitMerge} />
        </NavSection>
        
        <NavSection id="gestion" label="Gestión de la Información" icon={Briefcase}>
          <NavItem id="upload" label="Carga de Datos" icon={CheckSquare} />
          <NavItem id="pwps" label="Edición de Datos" icon={FileText} />
          <NavItem id="modeling" label="Modelado Nodal" icon={Network} />
          <NavItem id="views" label="Vistas Personalizadas" icon={LayoutGrid} />
          <NavItem id="programming" label="Programación" icon={Activity} />
        </NavSection>
        
        <NavSection id="tableros" label="Tableros de equipo" icon={Users}>
          <NavItem id="explorer" label="Explorador Relacional" icon={Search} />
          <NavItem id="cwp-dashboard" label="Dashboard de CWPs" icon={Activity} />
        </NavSection>
        
        <NavSection id="informes" label="Informes" icon={FileText}>
          <NavItem id="audit" label="Auditoría de Integridad" icon={Activity} />
        </NavSection>
        
        <NavSection id="ingenieria" label="Ingeniería" icon={FolderGit2}>
          <NavItem id="drawing-log" label="Log de planos" icon={FileText} />
        </NavSection>

        <NavSection id="planificacion" label="Planificación Temprana" icon={Calendar}>
          <div className="w-full px-9 py-2 text-sm text-slate-600 hover:bg-slate-100 cursor-pointer text-left">Matriz AWP</div>
          <div className="w-full px-9 py-2 text-sm text-slate-600 hover:bg-slate-100 cursor-pointer text-left">Áreas de trabajo (CWAs)</div>
        </NavSection>

        <NavSection id="procura" label="Procura" icon={ShoppingCart}>
          <NavItem id="bom" label="Bill of Materials" />
          <NavItem id="material-catalog" label="Material Catalog" />
          <NavItem id="material-inventory" label="Material Inventory" />
          <NavItem id="mechanical-eq" label="Mechanical Equipment" />
          <NavItem id="po" label="Purchase Orders" />
          <NavItem id="req" label="Requisitions" />
        </NavSection>
        
        <NavSection id="proyectos" label="Proyectos" icon={FolderGit2} />
      </div>
      <div className="p-4 border-t border-slate-200 text-xs text-slate-400 flex justify-between">
        <span>26.6</span>
      </div>
    </aside>
  );
}
