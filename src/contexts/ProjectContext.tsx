'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  owner_id: string;
}

interface ProjectContextValue {
  projects: Project[];
  currentProject: Project | null;
  loading: boolean;
  switchProject: (projectId: string) => void;
  createProject: (name: string, description?: string) => Promise<Project | null>;
  refreshProjects: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ProjectContext = createContext<ProjectContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [projects, setProjects]           = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [loading, setLoading]             = useState(true);

  const loadProjects = useCallback(async () => {
    if (!user) {
      setProjects([]);
      setCurrentProject(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    const list: Project[] = data || [];
    setProjects(list);

    // Restore last selected project from localStorage
    const savedId = typeof window !== 'undefined'
      ? localStorage.getItem('dp4d_current_project')
      : null;
    const found = savedId ? list.find(p => p.id === savedId) : null;
    setCurrentProject(found || list[0] || null);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const switchProject = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setCurrentProject(project);
      localStorage.setItem('dp4d_current_project', projectId);
    }
  };

  const createProject = async (name: string, description?: string): Promise<Project | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('projects')
      .insert({ name: name.trim(), description: description?.trim() || null, owner_id: user.id })
      .select()
      .single();
    if (!error && data) {
      const project = data as Project;
      setProjects(prev => [project, ...prev]);
      setCurrentProject(project);
      localStorage.setItem('dp4d_current_project', project.id);
      return project;
    }
    return null;
  };

  return (
    <ProjectContext.Provider value={{
      projects,
      currentProject,
      loading,
      switchProject,
      createProject,
      refreshProjects: loadProjects,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}
