'use client';

import React, { useState } from 'react';
import {
  Star, Briefcase, Users, FileText, Calendar,
  FolderGit2, ChevronDown, ChevronRight, Activity,
  Network, CheckSquare, Search, GitMerge, ShoppingCart, LayoutGrid
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    favoritos:    true,
    gestion:      true,
    tableros:     true,
    informes:     false,
    planificacion: false,
    ingenieria:   false,
    procura:      false,
    proyectos:    false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const NavItem = ({
    id, label, icon: Icon, isSub = true,
  }: { id: string; label: string; icon?: React.ElementType; isSub?: boolean }) => {
    const isActive = activeTab === id;
    return (
      <button
        onClick={() => onTabChange(id)}
        className={`w-full flex items-center px-4 py-2 text-[12px] text-left transition-all rounded-r-xl mr-2 ${
          isActive
            ? 'bg-[#EFF6FF] text-[#1E3A8A] font-bold border-l-[3px] border-[#F5C518]'
            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 border-l-[3px] border-transparent font-medium'
        } ${isSub ? 'pl-9' : ''}`}
      >
        {Icon && (
          <Icon
            className={`w-4 h-4 mr-2.5 shrink-0 ${isActive ? 'text-[#1E3A8A]' : 'text-slate-400'}`}
          />
        )}
        <span className="truncate">{label}</span>
        {isActive && (
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#F5C518] shrink-0" />
        )}
      </button>
    );
  };

  const NavSection = ({ id, label, icon: Icon, children }: any) => {
    const isExpanded = expandedSections[id];
    return (
      <div className="mb-0.5">
        <button
          onClick={() => toggleSection(id)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-black text-slate-400 uppercase tracking-widest hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Icon className="w-3.5 h-3.5" />
            {label}
          </div>
          {isExpanded
            ? <ChevronDown className="w-3.5 h-3.5" />
            : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        {isExpanded && (
          <div className="mt-0.5 space-y-0.5 pb-1">
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="w-[256px] flex-shrink-0 bg-white border-r border-slate-200 h-full flex flex-col overflow-hidden">
      {/* ── Brand header in sidebar ── */}
      <div className="px-4 py-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
        <div className="w-7 h-7 rounded-md bg-[#1E3A8A] flex items-center justify-center shadow-sm">
          <span className="text-white text-[10px] font-black tracking-tighter">AG</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[#0F2544] font-black text-[13px] tracking-tight leading-none">Antigravity</span>
          <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase leading-none mt-0.5">AWP Platform</span>
        </div>
      </div>

      {/* ── Navigation ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-3">
        <NavSection id="favoritos" label="Favoritos" icon={Star}>
          <NavItem id="tree" label="Índice Maestro AWP" icon={GitMerge} />
        </NavSection>

        <NavSection id="gestion" label="Gestión de Datos" icon={Briefcase}>
          <NavItem id="upload"     label="Carga de Datos"         icon={CheckSquare} />
          <NavItem id="pwps"       label="Edición de Datos"       icon={FileText} />
          <NavItem id="modeling"   label="Modelado Nodal"         icon={Network} />
          <NavItem id="views"      label="Vistas Personalizadas"  icon={LayoutGrid} />
          <NavItem id="programming" label="Programación"          icon={Activity} />
        </NavSection>

        <NavSection id="tableros" label="Tableros" icon={Users}>
          <NavItem id="explorer"      label="Explorador Relacional" icon={Search} />
          <NavItem id="cwp-dashboard" label="Dashboard CWPs"        icon={Activity} />
        </NavSection>

        <NavSection id="informes" label="Informes" icon={FileText}>
          <NavItem id="audit" label="Auditoría de Integridad" icon={Activity} />
        </NavSection>

        <NavSection id="ingenieria" label="Ingeniería" icon={FolderGit2}>
          <NavItem id="drawing-log" label="Log de Planos" icon={FileText} />
        </NavSection>

        <NavSection id="planificacion" label="Planificación Temprana" icon={Calendar}>
          <div className="px-9 py-2 text-[12px] text-slate-400 hover:bg-slate-50 cursor-pointer font-medium">Matriz AWP</div>
          <div className="px-9 py-2 text-[12px] text-slate-400 hover:bg-slate-50 cursor-pointer font-medium">Áreas de Trabajo (CWAs)</div>
        </NavSection>

        <NavSection id="procura" label="Procura" icon={ShoppingCart}>
          <NavItem id="bom"              label="Bill of Materials" />
          <NavItem id="material-catalog" label="Material Catalog" />
          <NavItem id="material-inventory" label="Material Inventory" />
          <NavItem id="mechanical-eq"    label="Mechanical Equipment" />
          <NavItem id="po"               label="Purchase Orders" />
          <NavItem id="req"              label="Requisitions" />
        </NavSection>

        <NavSection id="proyectos" label="Proyectos" icon={FolderGit2} />
      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between shrink-0">
        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">v26.6</span>
        <span className="px-2 py-0.5 bg-[#F5C518]/20 text-[#D97706] text-[8px] font-black rounded-full uppercase tracking-widest">nano banana</span>
      </div>
    </aside>
  );
}
