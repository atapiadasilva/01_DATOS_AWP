'use client';

import React, { useState } from 'react';
import {
  Star, Briefcase, Users, FileText, Calendar,
  FolderGit2, ChevronDown, ChevronRight, Activity,
  Network, CheckSquare, Search, GitMerge, ShoppingCart, LayoutGrid, Grid3x3, Settings, Crown, Link2, ShieldCheck, BarChart3, Shield, Box, LayoutTemplate
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { ROLE_COLORS, ROLE_LABELS } from '@/lib/permissions';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { role, isPlatformAdmin } = useAuth();
  const { projects, currentProject, switchProject } = useProject();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    favoritos:    true,
    gestion:      true,
    tableros:     true,
    informes:     false,
    planificacion: false,
    ingenieria:   false,
    procura:      false,
    proyectos:    false,
    config:       true,
    platform:     true,
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
            ? 'bg-brand-electric/10 text-brand-deep font-bold border-l-[3px] border-brand-orange'
            : 'text-brand-slate/60 hover:bg-brand-cloud hover:text-brand-deep border-l-[3px] border-transparent font-medium'
        } ${isSub ? 'pl-9' : ''}`}
      >
        {Icon && (
          <Icon
            className={`w-4 h-4 mr-2.5 shrink-0 ${isActive ? 'text-brand-deep' : 'text-brand-slate/40'}`}
          />
        )}
        <span className="truncate">{label}</span>
        {isActive && (
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-orange shrink-0 shadow-[0_0_5px_rgba(255,152,0,0.5)]" />
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
          className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-black text-brand-slate/40 uppercase tracking-widest hover:bg-brand-cloud hover:text-brand-deep transition-colors"
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
    <aside className="w-[256px] flex-shrink-0 bg-white/80 backdrop-blur-xl border-r border-white/50 h-full flex flex-col overflow-hidden shadow-2xl shadow-brand-deep/5 z-20">
      {/* ── Brand header in sidebar ── */}
      <div className="px-4 py-6 border-b border-brand-cloud flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-xl bg-brand-deep flex items-center justify-center shadow-lg shadow-brand-deep/20">
          <Network className="text-brand-electric" size={18} />
        </div>
        <div className="flex flex-col">
          <span className="text-brand-deep font-black text-[14px] tracking-tighter leading-none italic uppercase">DataPower<span className="text-brand-electric">4D</span></span>
          <span className="text-[9px] font-black text-brand-slate/40 tracking-widest uppercase leading-none mt-1">AWP Ecosystem</span>
        </div>
      </div>

      {/* ── Navigation ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-3">
        <NavSection id="favoritos" label="Panel de Control" icon={Star}>
          <NavItem id="cwp-dashboard" label="Dashboard CWPs"        icon={Activity} />

          <NavItem id="tree"          label="Índice Maestro AWP"    icon={GitMerge} />
        </NavSection>

        <NavSection id="gestion" label="Inteligencia de Datos" icon={Briefcase}>
          <NavItem id="sot"        label="Catálogo Maestro CWP"   icon={ShieldCheck} />
          <NavItem id="upload"     label="Carga de Datos"         icon={CheckSquare} />
          <NavItem id="pwps"       label="Edición Maestra"        icon={FileText} />
          <NavItem id="modeling"   label="Modelado de Red"        icon={Network} />
          <NavItem id="scheduler"  label="Mapeo WBS-CWP"           icon={Link2} />
          <NavItem id="views"      label="Vistas Dinámicas"       icon={LayoutGrid} />
          <NavItem id="programming" label="Programación"          icon={Activity} />
        </NavSection>

        <NavSection id="tableros" label="Análisis Productivo" icon={Users}>
          <NavItem id="explorer"      label="Explorador Relacional" icon={Search} />
          <NavItem id="matrix"        label="Matriz de Seguimiento" icon={Grid3x3} />
        </NavSection>

        <NavSection id="informes" label="Gobernanza" icon={FileText}>
          <NavItem id="audit" label="Auditoría de Integridad" icon={Activity} />
        </NavSection>

        <NavSection id="ingenieria" label="Ingeniería" icon={FolderGit2}>
          <NavItem id="drawing-log" label="Log de Planos"   icon={FileText} />
          <NavItem id="viewer3d"    label="Visor 3D / BIM"  icon={Box} />
          <NavItem id="viewer3d-wbs" label="Visor 3D + Programa" icon={LayoutTemplate} />
        </NavSection>

        <NavSection id="procura" label="Suministros & Procura" icon={ShoppingCart}>
          <NavItem id="bom"              label="Bill of Materials" />
          <NavItem id="material-catalog" label="Material Catalog" />
          <NavItem id="material-inventory" label="Material Inventory" />
          <NavItem id="mechanical-eq"    label="Mechanical Equipment" />
          <NavItem id="po"               label="Purchase Orders" />
          <NavItem id="req"              label="Requisitions" />
        </NavSection>

        <NavSection id="proyectos" label="Proyectos" icon={FolderGit2}>
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => switchProject(p.id)}
              className={`w-full flex items-center px-4 py-1.5 text-[11px] text-left transition-all rounded-r-xl mr-2 pl-9 ${
                currentProject?.id === p.id
                  ? 'bg-brand-orange/10 text-brand-deep font-bold border-l-[3px] border-brand-orange'
                  : 'text-brand-slate/50 hover:bg-brand-cloud hover:text-brand-deep border-l-[3px] border-transparent'
              }`}
            >
              <Briefcase size={12} className={`mr-2 shrink-0 ${currentProject?.id === p.id ? 'text-brand-orange' : 'text-brand-slate/30'}`} />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
          {projects.length === 0 && (
            <p className="px-9 py-2 text-[10px] italic text-brand-slate/30">Sin proyectos</p>
          )}
        </NavSection>

        {role === 'admin' && (
          <NavSection id="config" label="Administración" icon={Settings}>
            <NavItem id="settings" label="Configuración & Roles" icon={Crown} />
          </NavSection>
        )}

        {isPlatformAdmin && (
          <NavSection id="platform" label="Plataforma" icon={Shield}>
            <NavItem id="platform-admin" label="Admin de Plataforma" icon={Shield} />
          </NavSection>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-3 border-t border-brand-cloud flex items-center justify-between shrink-0 bg-brand-cloud/30">
        <span className="text-[9px] font-black text-brand-slate/30 uppercase tracking-widest">v3.0.0</span>
        <span className={`px-2 py-0.5 text-[8px] font-black rounded-full uppercase tracking-widest border ${ROLE_COLORS[role]}`}>
          {ROLE_LABELS[role]}
        </span>
      </div>
    </aside>
  );
}
