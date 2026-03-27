'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'archived';
  created_at: string;
  user_id: string;
}

export interface ProjectMember {
  user_id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'editor' | 'viewer';
  joined_at: string;
}

interface ProjectContextValue {
  projects: Project[];
  currentProject: Project | null;
  loading: boolean;
  switchProject: (projectId: string) => void;
  createProject: (name: string, description?: string) => Promise<Project | null>;
  archiveProject: (projectId: string, archived: boolean) => Promise<boolean>;
  refreshProjects: () => Promise<void>;
  getProjectMembers: (projectId: string) => Promise<ProjectMember[]>;
  addProjectMember: (projectId: string, userId: string, role: 'admin' | 'editor' | 'viewer') => Promise<boolean>;
  removeProjectMember: (projectId: string, userId: string) => Promise<boolean>;
  updateProjectMemberRole: (projectId: string, userId: string, role: 'admin' | 'editor' | 'viewer') => Promise<boolean>;
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
      .insert({ name: name.trim(), description: description?.trim() || null, user_id: user.id, status: 'active' })
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

  const archiveProject = async (projectId: string, archived: boolean): Promise<boolean> => {
    const { error } = await supabase
      .from('projects')
      .update({ status: archived ? 'archived' : 'active' })
      .eq('id', projectId);
    if (!error) {
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: archived ? 'archived' : 'active' } : p));
      return true;
    }
    return false;
  };

  const getProjectMembers = async (projectId: string): Promise<ProjectMember[]> => {
    const { data } = await supabase.rpc('get_project_members', { p_project_id: projectId });
    return (data as ProjectMember[]) || [];
  };

  const addProjectMember = async (projectId: string, userId: string, role: 'admin' | 'editor' | 'viewer'): Promise<boolean> => {
    const { error } = await supabase
      .from('project_members')
      .upsert({ project_id: projectId, user_id: userId, role }, { onConflict: 'project_id,user_id' });
    return !error;
  };

  const removeProjectMember = async (projectId: string, userId: string): Promise<boolean> => {
    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', userId);
    return !error;
  };

  const updateProjectMemberRole = async (projectId: string, userId: string, role: 'admin' | 'editor' | 'viewer'): Promise<boolean> => {
    const { error } = await supabase
      .from('project_members')
      .update({ role })
      .eq('project_id', projectId)
      .eq('user_id', userId);
    return !error;
  };

  return (
    <ProjectContext.Provider value={{
      projects,
      currentProject,
      loading,
      switchProject,
      createProject,
      archiveProject,
      refreshProjects: loadProjects,
      getProjectMembers,
      addProjectMember,
      removeProjectMember,
      updateProjectMemberRole,
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
