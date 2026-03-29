'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Search, Bell, HelpCircle, Network, ChevronDown, Plus, LogOut,
  Settings, Check, FolderOpen, Settings2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/permissions';
import ProjectSetupWizard from '@/components/project/ProjectSetupWizard';

interface TopbarProps {
  onTabChange?: (tab: string) => void;
}

export default function Topbar({ onTabChange }: TopbarProps) {
  const { user, role, signOut } = useAuth();
  const { projects, currentProject, projectSettings, switchProject } = useProject();

  const [projectOpen, setProjectOpen] = useState(false);
  const [userOpen,    setUserOpen]    = useState(false);
  const [showWizard,  setShowWizard]  = useState(false);
  const [wizardProjectId, setWizardProjectId] = useState<string | undefined>();

  const projectRef = useRef<HTMLDivElement>(null);
  const userRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (projectRef.current && !projectRef.current.contains(e.target as Node)) setProjectOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openNewWizard = () => {
    setWizardProjectId(undefined);
    setShowWizard(true);
    setProjectOpen(false);
  };

  const openConfigWizard = (projectId: string) => {
    setWizardProjectId(projectId);
    setShowWizard(true);
    setProjectOpen(false);
  };

  const initials = user?.email?.charAt(0).toUpperCase() || '?';
  const activeProjects = projects.filter(p => p.status !== 'archived');

  return (
    <>
      <header className="h-14 bg-white/80 backdrop-blur-xl border-b border-brand-cloud flex items-center justify-between px-5 z-20 sticky top-0 shadow-sm shadow-brand-deep/5">

        {/* ── Brand ── */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-brand-deep flex items-center justify-center shadow-lg shadow-brand-deep/30 shrink-0">
              <Network className="text-brand-electric" size={16} />
            </div>
            <span className="text-brand-deep font-black text-[17px] tracking-tight leading-none select-none italic uppercase">
              data<span className="text-brand-electric">power</span><span className="text-brand-orange">4D</span>
            </span>
          </div>

          {/* ── Project selector ── */}
          <div className="relative ml-2" ref={projectRef}>
            <button
              onClick={() => setProjectOpen(!projectOpen)}
              className="flex items-center gap-1.5 hover:bg-brand-cloud px-3 py-1.5 rounded-lg text-sm font-semibold text-brand-slate/60 border border-transparent hover:border-brand-cloud transition-all"
            >
              <FolderOpen size={14} className="text-brand-slate/40" />
              <span className="max-w-[160px] truncate">
                {currentProject?.name || 'Sin proyecto'}
              </span>
              {/* Setup indicator */}
              {currentProject && !projectSettings?.setup_completed && (
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Proyecto sin configurar" />
              )}
              <ChevronDown className={`w-3.5 h-3.5 text-brand-slate/40 transition-transform ${projectOpen ? 'rotate-180' : ''}`} />
            </button>

            {projectOpen && (
              <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl shadow-brand-deep/10 border border-brand-cloud z-50 overflow-hidden">

                {/* Project list */}
                <div className="max-h-56 overflow-y-auto">
                  {activeProjects.length === 0 ? (
                    <div className="px-4 py-6 text-xs text-brand-slate/40 italic text-center">Sin proyectos aún</div>
                  ) : (
                    activeProjects.map(p => {
                      const isCurrent = currentProject?.id === p.id;
                      return (
                        <div key={p.id} className={`flex items-center gap-2 px-3 py-2.5 transition-colors group
                          ${isCurrent ? 'bg-brand-cloud/60' : 'hover:bg-brand-cloud/30'}`}>
                          {/* Switch button */}
                          <button
                            onClick={() => { switchProject(p.id); setProjectOpen(false); }}
                            className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                          >
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0
                              ${isCurrent ? 'bg-brand-electric/10' : 'bg-brand-deep/5'}`}>
                              <FolderOpen size={13} className={isCurrent ? 'text-brand-electric' : 'text-brand-deep/40'} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-bold text-brand-slate truncate">{p.name}</p>
                              <p className="text-[9px] text-brand-slate/40 uppercase tracking-widest font-black">
                                {new Date(p.created_at).toLocaleDateString('es-CL')}
                              </p>
                            </div>
                            {isCurrent && <Check size={13} className="text-brand-electric shrink-0" />}
                          </button>

                          {/* Configure button */}
                          <button
                            onClick={() => openConfigWizard(p.id)}
                            title="Configurar modelo y WBS"
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-brand-slate/30 hover:text-brand-deep hover:bg-brand-cloud transition-all shrink-0">
                            <Settings2 size={12} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* New project button */}
                <div className="border-t border-brand-cloud p-3">
                  <button
                    onClick={openNewWizard}
                    className="w-full flex items-center gap-2 px-3 py-2.5 bg-brand-deep hover:bg-brand-electric rounded-xl text-[11px] font-black text-white uppercase tracking-widest transition-all shadow-md shadow-brand-deep/20"
                  >
                    <Plus size={13} /> Nuevo proyecto
                  </button>
                </div>
              </div>
            )}
          </div>
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

            {/* User menu */}
            <div className="relative ml-1" ref={userRef}>
              <button
                onClick={() => setUserOpen(!userOpen)}
                className="flex items-center gap-2 pl-1 pr-2 py-1 hover:bg-brand-cloud rounded-full transition-colors"
              >
                <div className="w-7 h-7 bg-brand-deep rounded-full flex items-center justify-center shadow-sm shadow-brand-deep/30">
                  <span className="text-brand-electric text-[11px] font-black">{initials}</span>
                </div>
                <ChevronDown size={12} className={`text-brand-slate/40 transition-transform ${userOpen ? 'rotate-180' : ''}`} />
              </button>

              {userOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl shadow-brand-deep/10 border border-brand-cloud z-50 overflow-hidden">
                  <div className="px-4 py-4 border-b border-brand-cloud">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-brand-deep rounded-xl flex items-center justify-center shadow-md shadow-brand-deep/20">
                        <span className="text-brand-electric text-sm font-black">{initials}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-brand-deep truncate">{user?.email}</p>
                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${ROLE_COLORS[role]}`}>
                          {ROLE_LABELS[role]}
                        </span>
                      </div>
                    </div>
                  </div>

                  {role === 'admin' && onTabChange && (
                    <button
                      onClick={() => { onTabChange('settings'); setUserOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-brand-cloud/50 transition-colors text-left"
                    >
                      <Settings size={14} className="text-brand-slate/40" />
                      <span className="text-[12px] font-bold text-brand-slate">Configuración & Roles</span>
                    </button>
                  )}

                  <button
                    onClick={signOut}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition-colors text-left border-t border-brand-cloud/50"
                  >
                    <LogOut size={14} className="text-red-400" />
                    <span className="text-[12px] font-bold text-red-500">Cerrar sesión</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Wizard modal ── */}
      {showWizard && (
        <ProjectSetupWizard
          projectId={wizardProjectId}
          onClose={() => setShowWizard(false)}
          onDone={() => setShowWizard(false)}
        />
      )}
    </>
  );
}
