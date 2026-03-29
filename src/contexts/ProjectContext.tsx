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

export interface ProjectSettings {
  id: string;
  project_id: string;
  aps_model_urn:        string | null;
  aps_model_name:       string | null;
  wbs_entity_name:      string;
  wbs_col_edt:          string;
  wbs_col_name:         string;
  wbs_col_start:        string;
  wbs_col_end:          string;
  wbs_col_baseline_start: string;
  wbs_col_baseline_end:   string;
  wbs_col_progress:     string;
  wbs_col_duration:     string;
  wbs_col_discipline:   string;
  wbs_col_cwp:          string | null;
  setup_completed:      boolean;
  setup_step:           number;
}

export interface ProjectMember {
  user_id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'editor' | 'viewer';
  joined_at: string;
}

interface ProjectContextValue {
  projects:       Project[];
  currentProject: Project | null;
  projectSettings: ProjectSettings | null;
  loading:        boolean;
  switchProject:  (projectId: string) => void;
  createProject:  (name: string, description?: string) => Promise<Project | null>;
  cloneProject:   (sourceId: string, name: string, description?: string, cloneData?: boolean) => Promise<Project | null>;
  archiveProject: (projectId: string, archived: boolean) => Promise<boolean>;
  refreshProjects: () => Promise<void>;
  saveProjectSettings: (fields: Partial<Omit<ProjectSettings, 'id' | 'project_id'>>) => Promise<ProjectSettings | null>;
  getProjectMembers:     (projectId: string) => Promise<ProjectMember[]>;
  addProjectMember:      (projectId: string, userId: string, role: 'admin' | 'editor' | 'viewer') => Promise<boolean>;
  removeProjectMember:   (projectId: string, userId: string) => Promise<boolean>;
  updateProjectMemberRole: (projectId: string, userId: string, role: 'admin' | 'editor' | 'viewer') => Promise<boolean>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ProjectContext = createContext<ProjectContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [projects,         setProjects]         = useState<Project[]>([]);
  const [currentProject,   setCurrentProject]   = useState<Project | null>(null);
  const [projectSettings,  setProjectSettings]  = useState<ProjectSettings | null>(null);
  const [loading,          setLoading]          = useState(true);

  const loadProjects = useCallback(async () => {
    if (!user) {
      setProjects([]);
      setCurrentProject(null);
      setProjectSettings(null);
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

    const savedId = typeof window !== 'undefined'
      ? localStorage.getItem('dp4d_current_project')
      : null;
    const found = savedId ? list.find(p => p.id === savedId) : null;
    const active = found || list[0] || null;
    setCurrentProject(active);
    setLoading(false);

    if (active) loadSettings(active.id);
  }, [user]);

  const loadSettings = useCallback(async (projectId: string) => {
    const { data } = await supabase
      .from('project_settings')
      .select('*')
      .eq('project_id', projectId)
      .single();
    setProjectSettings((data as ProjectSettings) ?? null);
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const switchProject = useCallback((projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setCurrentProject(project);
      setProjectSettings(null);
      localStorage.setItem('dp4d_current_project', projectId);
      loadSettings(projectId);
    }
  }, [projects, loadSettings]);

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
      // Trigger will have created the settings row; load it
      setTimeout(() => loadSettings(project.id), 500);
      return project;
    }
    return null;
  };

  const cloneProject = async (sourceId: string, name: string, description?: string, cloneData?: boolean): Promise<Project | null> => {
    if (!user) return null;
    const { data: newProjectId, error } = await supabase.rpc('clone_project_structure', {
      p_source_id: sourceId,
      p_new_name: name.trim(),
      p_desc: description?.trim() || null,
      p_user_id: user.id,
      p_clone_data: cloneData || false
    });

    if (!error && newProjectId) {
      // Fetch the newly created project to update context
      const { data: projData } = await supabase.from('projects').select('*').eq('id', newProjectId).single();
      if (projData) {
        const project = projData as Project;
        setProjects(prev => [project, ...prev]);
        setCurrentProject(project);
        localStorage.setItem('dp4d_current_project', project.id);
        setTimeout(() => loadSettings(project.id), 500);
        return project;
      }
    } else {
      console.error('[cloneProject] error:', error);
    }
    return null;
  };

  const archiveProject = async (projectId: string, archived: boolean): Promise<boolean> => {
    const { error } = await supabase
      .from('projects')
      .update({ status: archived ? 'archived' : 'active' })
      .eq('id', projectId);
    if (!error) {
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, status: archived ? 'archived' : 'active' } : p
      ));
      return true;
    }
    return false;
  };

  const saveProjectSettings = async (
    fields: Partial<Omit<ProjectSettings, 'id' | 'project_id'>>
  ): Promise<ProjectSettings | null> => {
    if (!currentProject) return null;
    const res = await fetch('/api/project-settings', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ projectId: currentProject.id, ...fields }),
    });
    const data = await res.json();
    if (!res.ok) { console.error('[saveProjectSettings]', data); return null; }
    setProjectSettings(data as ProjectSettings);
    return data;
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
      projectSettings,
      loading,
      switchProject,
      createProject,
      cloneProject,
      archiveProject,
      refreshProjects: loadProjects,
      saveProjectSettings,
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
